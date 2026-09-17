import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function transpile(path) {
  return ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText;
}

function loadAuthApi(responder) {
  const calls = [];
  const exports = {};
  runInNewContext(transpile("../src/auth/authApi.ts"), {
    exports,
    require: name => name === "../api" ? { API_URL: "" } : {
      browserRequest: async (url, options) => {
        calls.push({ url, options });
        return responder(url, options);
      }
    },
    navigator: undefined,
    Promise,
    Error,
    JSON
  });
  return { exports, calls };
}

test("forgot-password uses the secured auth request path and shows the generic result", async () => {
  const generic = "If an account exists for this email, a reset link has been sent.";
  const { exports, calls } = loadAuthApi(async () => ({
    ok: true,
    json: async () => ({ message: generic })
  }));

  const result = await exports.requestPasswordReset("user@example.com");

  assert.equal(result.message, generic);
  assert.equal(calls[0].url, "/api/auth/forgot-password");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: "user@example.com" });
  assert.match(
    readFileSync(new URL("../src/auth/ForgotPasswordPage.tsx", import.meta.url), "utf8"),
    /If an account exists for this email/
  );
});

test("reset-password sends the in-memory token and normalizes invalid-link errors", async () => {
  const { exports, calls } = loadAuthApi(async () => ({
    ok: false,
    json: async () => ({ error: "The reset link is invalid or has expired." })
  }));

  await assert.rejects(
    exports.resetPassword("temporary-token", "new-password", "new-password"),
    /invalid or has expired/
  );
  assert.equal(calls[0].url, "/api/auth/reset-password");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    token: "temporary-token",
    password: "new-password",
    confirmPassword: "new-password"
  });
});

test("reset token parsing and password validation are deterministic", () => {
  const exports = {};
  runInNewContext(transpile("../src/auth/passwordResetForm.ts"), {
    exports,
    URLSearchParams,
    TextEncoder
  });

  const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567_-";
  assert.equal(token.length, 43);
  assert.equal(exports.resetTokenFromHash(`#token=${token}`), token);
  assert.equal(exports.resetTokenFromHash(`#token=${token.replace("_", "%5F")}`), token);
  assert.equal(exports.resetTokenFromHash(""), "");
  assert.equal(exports.resetTokenFromHash("#token="), "");
  assert.equal(exports.resetTokenFromHash("#token=malformed"), "");
  assert.equal(exports.resetTokenFromHash(`?token=${token}`), "");
  assert.equal(exports.resetPasswordValidation("new-password", "different"), "Passwords do not match");
  assert.match(exports.resetPasswordValidation("short", "short"), /at least 8/);
  assert.equal(exports.resetPasswordValidation("new-password", "new-password"), null);
});

test("reset UI retains the fragment token in memory, scrubs it, and never persists it", () => {
  const resetSource = readFileSync(
    new URL("../src/auth/ResetPasswordPage.tsx", import.meta.url),
    "utf8"
  );
  const loginSource = readFileSync(new URL("../src/auth/LoginPage.tsx", import.meta.url), "utf8");
  const formSource = readFileSync(
    new URL("../src/auth/passwordResetForm.ts", import.meta.url),
    "utf8"
  );
  const combined = resetSource + formSource;

  assert.match(loginSource, /Forgot password\?/);
  assert.match(resetSource, /useState\(\(\) => resetTokenFromHash\(window\.location\.hash\)\)/);
  assert.match(resetSource, /useLayoutEffect/);
  assert.match(resetSource, /history\.replaceState\(\{\}, "", "\/reset-password"\)/);
  assert.match(resetSource, /location\.replace\("\/\?passwordReset=success"\)/);
  assert.match(loginSource, /Your password has been reset\. Please sign in\./);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
  assert.doesNotMatch(combined, /location\.search|resetTokenFromSearch|\?token=/);
  assert.match(loginSource, /await onSignIn\(identifier, password, rememberMe\)/);
});
