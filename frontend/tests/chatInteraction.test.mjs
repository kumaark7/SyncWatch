import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/party/chat/chatViewport.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;
const exports = {};
runInNewContext(source, { exports });

test("opening chat positions the message list at the latest message", () => {
  const list = { scrollHeight: 1840, scrollTop: 0 };
  exports.scrollChatToLatest(list);
  assert.equal(list.scrollTop, 1840);
});

test("the chat shortcut focuses and reveals the existing composer", () => {
  const calls = [];
  const input = {
    focus(options) { calls.push(["focus", options]); },
    scrollIntoView(options) { calls.push(["scroll", options]); }
  };

  exports.focusChatInput(input);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["focus", { preventScroll: true }],
    ["scroll", { block: "nearest" }]
  ]);
});
