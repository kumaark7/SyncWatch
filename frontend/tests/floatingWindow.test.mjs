import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

const source = ts.transpileModule(
  readFileSync(new URL("../src/party/call/useFloatingWindow.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;

function harness(width = 1280) {
  const slots = [], listeners = new Map(), effects = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, next => {
        slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
      }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn) { effects.push(fn); }
  };
  const exports = {};
  runInNewContext(source, { exports, require: () => react, window: {
    innerWidth: width, innerHeight: 800,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name)
  }});
  const target = {
    captured: false,
    setPointerCapture() { this.captured = true; },
    hasPointerCapture() { return this.captured; },
    releasePointerCapture() { this.captured = false; }
  };
  const event = {pointerId: 1, pointerType: width < 640 ? "touch" : "mouse", button: 0,
    clientX: 100, clientY: 100, currentTarget: target, preventDefault() {}, stopPropagation() {}};
  return {
    target, event,
    render() { cursor = 0; const value = exports.default(); effects.splice(0).forEach(fn => fn()); return value; },
    move(dx, dy) { listeners.get("pointermove")({pointerId: 1, clientX: 100 + dx, clientY: 100 + dy}); },
    end() { listeners.get("pointerup")({pointerId: 1}); }
  };
}

test("dragging the full bottom edge changes height without changing width or position", () => {
  const h = harness();
  const before = h.render();
  before.startResize(h.event, "bottom");
  h.move(80, 50);
  const after = h.render();
  assert.equal(after.style.width, before.style.width);
  assert.equal(after.style.height, before.style.height + 50);
  assert.equal(after.style.transform, before.style.transform);
  h.end();
  assert.equal(h.target.captured, false);
  assert.equal(h.render().resizing, false);
});

test("bottom-left corner keeps its opposite edge fixed and minimum size remains bounded", () => {
  const h = harness();
  h.render().moveBy(-300, 0);
  const before = h.render();
  before.startResize(h.event, "bottom-left");
  h.move(-40, 20);
  const after = h.render();
  assert.equal(after.style.width, before.style.width + 40);
  assert.equal(after.style.height, before.style.height + 20);
  const x = value => Number(value.style.transform.match(/translate3d\(([-\d.]+)px/)[1]);
  assert.equal(x(after) + after.style.width, x(before) + before.style.width);
  h.move(1000, -1000);
  const smallest = h.render();
  assert.equal(smallest.style.width, 180);
  assert.equal(smallest.style.height, 110);
});

test("touch users can resize from the bottom edge and cancellation releases capture", () => {
  const h = harness(390);
  const before = h.render();
  before.startResize(h.event, "bottom");
  h.move(0, 32);
  assert.equal(h.render().style.height, before.style.height + 32);
  h.render().cancelOperation(h.event);
  assert.equal(h.target.captured, false);
  const height = h.render().style.height;
  h.move(0, 80);
  assert.equal(h.render().style.height, height);
});

test("microphone and camera precede secondary controls in rendered and keyboard order", () => {
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(new URL("../src/party/call/CallControls.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
  ).outputText;
  runInNewContext(code, { exports, require(name) {
    if (name === "@livekit/components-react") {
      return { useLocalParticipant: () => ({ isMicrophoneEnabled: false, isCameraEnabled: false }) };
    }
    if (name === "./CallProvider") return { useCall: () => ({}) };
    if (name === "./PushToTalkProvider") return { usePushToTalk: () => ({}) };
    if (/^\.\/Call.*Menu$/.test(name)) return { default: () => null };
    return require(name);
  }});
  const React = require("react");
  const html = require("react-dom/server").renderToStaticMarkup(React.createElement(exports.default));
  const primaryLabels = [...html.matchAll(/<button[^>]*class="callControlIcon callControlMain[^>]*aria-label="([^"]+)"/g)]
    .map(match => match[1]);
  assert.deepEqual(primaryLabels.slice(0, 2), ["Unmute microphone", "Turn camera on"]);
});
