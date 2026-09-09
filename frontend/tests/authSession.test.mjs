import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/auth/authApi.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;

test("overlapping session checks share one cookie-rotation request without caching the result", async () => {
  let count = 0, complete;
  const exports = {};
  const response = new Promise(resolve => { complete = resolve; });
  runInNewContext(source, { exports, require: name => name === "../api" ? { API_URL: "" } : {
    browserRequest: () => { count++; return response; }
  } });
  const first = exports.getAuthSession();
  const second = exports.getAuthSession();
  assert.equal(first, second);
  assert.equal(count, 1);
  complete({ ok: true, json: async () => ({ authenticated: true }) });
  assert.equal((await first).authenticated, true);
  await exports.getAuthSession();
  assert.equal(count, 2);
});

test("supported browsers serialize session reads with a cross-tab Web Lock", async () => {
  const exports = {};
  const locks = [];
  runInNewContext(source, {
    exports,
    navigator: { locks: { request: async (name, action) => { locks.push(name); return action(); } } },
    require: name => name === "../api" ? { API_URL: "" } : {
      browserRequest: async () => ({ ok: true, json: async () => ({ authenticated: true }) })
    }
  });
  await exports.getAuthSession();
  assert.deepEqual(locks, ["syncwatch.auth-session"]);
});
