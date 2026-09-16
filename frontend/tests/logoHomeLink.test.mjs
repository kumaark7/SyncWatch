import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(
  readFileSync(new URL("../src/components/LogoHomeLink.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

function renderLink(inRoom, answer) {
  let confirmations = 0;
  let departures = 0;
  let prevented = false;
  const exports = {};
  runInNewContext(source, {
    exports,
    require,
    window: { confirm: () => { confirmations++; return answer; } }
  });
  const element = exports.default({ inRoom, onLeaveRoom: () => { departures++; } });
  return {
    element,
    click() {
      element.props.onClick({ preventDefault: () => { prevented = true; } });
      return { confirmations, departures, prevented };
    }
  };
}

test("logos outside a room are ordinary Home links without confirmation", () => {
  const link = renderLink(false, true);
  assert.equal(link.element.type, "a");
  assert.equal(link.element.props.href, "/");
  assert.equal(link.element.props["aria-label"], "SyncWatch home");
  assert.deepEqual(link.click(), { confirmations: 0, departures: 0, prevented: false });
});

test("canceling a room logo navigation preserves the current room", () => {
  assert.deepEqual(renderLink(true, false).click(), {
    confirmations: 1, departures: 0, prevented: true
  });
});

test("confirming a room logo navigation invokes the existing leave action once", () => {
  assert.deepEqual(renderLink(true, true).click(), {
    confirmations: 1, departures: 1, prevented: true
  });
});
