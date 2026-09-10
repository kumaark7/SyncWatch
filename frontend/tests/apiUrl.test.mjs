import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(
  new URL("../src/api.ts", import.meta.url),
  "utf8"
);

function resolveApiUrl(env) {
  const executable = source
    .replace("export const API_URL =", "this.API_URL =")
    .replaceAll("import.meta.env.VITE_API_URL", "env.VITE_API_URL")
    .replaceAll("import.meta.env.DEV", "env.DEV");
  const context = { env };
  runInNewContext(executable, context);
  return context.API_URL;
}

test("development uses explicit API configuration when supplied", () => {
  assert.equal(
    resolveApiUrl({ VITE_API_URL: "http://192.168.1.10:8080", DEV: true }),
    "http://192.168.1.10:8080"
  );
});

test("production always uses the same origin", () => {
  assert.equal(resolveApiUrl({ VITE_API_URL: "", DEV: false }), "");
  assert.equal(
    resolveApiUrl({ VITE_API_URL: "http://localhost:8080", DEV: false }),
    ""
  );
});

test("local Vite development retains the localhost backend fallback", () => {
  assert.equal(
    resolveApiUrl({ VITE_API_URL: "", DEV: true }),
    "http://localhost:8080"
  );
});
