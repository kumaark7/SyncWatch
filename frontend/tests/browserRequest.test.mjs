import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/auth/browserRequest.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;

test("browser API requests carry CSRF header and cookies without changing body or retrying", async () => {
  const calls = [];
  const exports = {};
  runInNewContext(source, { exports, Headers, Request, fetch: async (...args) => {
    calls.push(args);
    return { status: 401 };
  } });
  const body = JSON.stringify({ clientId: "test" });
  const response = await exports.browserRequest("http://localhost/api/rooms/test/file", {
    method: "DELETE", body, headers: { "Content-Type": "application/json" }
  });
  assert.equal(response.status, 401);
  assert.equal(calls.length, 1);
  const init = calls[0][1];
  assert.equal(init.method, "DELETE");
  assert.equal(init.body, body);
  assert.equal(init.credentials, "include");
  assert.equal(init.headers.get("X-Requested-With"), "XmlHttpRequest");
  assert.equal(init.headers.get("Content-Type"), "application/json");
});
