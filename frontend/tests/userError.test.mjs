import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/userError.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;
const exports = {};
runInNewContext(source, { exports, Error, TypeError });

test("offline fetch failures use a recovery-focused message", () => {
  assert.equal(
    exports.userErrorMessage(new TypeError("Failed to fetch"), "Fallback", false),
    "You're offline. Reconnect to the internet and try again."
  );
});

test("online network failures never expose raw browser fetch text", () => {
  assert.equal(
    exports.userErrorMessage(new TypeError("Failed to fetch"), "Fallback", true),
    "SyncWatch couldn't reach the server. Check your connection and try again."
  );
  assert.equal(
    exports.userErrorMessage(new TypeError("NetworkError when attempting to fetch resource."), "Fallback", true),
    "SyncWatch couldn't reach the server. Check your connection and try again."
  );
});

test("clear application errors remain intact and unknown failures use context", () => {
  assert.equal(exports.userErrorMessage(new Error("Room not found"), "Fallback", true), "Room not found");
  assert.equal(exports.userErrorMessage(null, "Could not join this room.", true), "Could not join this room.");
});
