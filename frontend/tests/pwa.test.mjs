import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const workerSource = readFileSync(
  new URL("../public/service-worker.js", import.meta.url),
  "utf8"
);
const registeredEvents = [];
const context = {
  URL,
  Promise,
  Response,
  caches: {},
  fetch() {},
  self: {
    location: { origin: "https://play.projectdarkhope.xyz" },
    clients: {},
    addEventListener(type) {
      registeredEvents.push(type);
    }
  }
};
runInNewContext(
  `${workerSource}\nthis.__classifyRequest = classifyRequest; this.__shellFiles = APP_SHELL_FILES; this.__cacheVersion = CACHE_VERSION;`,
  context
);

function request(path, mode = "cors", method = "GET") {
  return {
    method,
    mode,
    url: `https://play.projectdarkhope.xyz${path}`
  };
}

test("service worker bypasses API, streaming, WebSocket and cross-origin traffic", () => {
  assert.equal(context.__classifyRequest(request("/api/auth/session")), "bypass");
  assert.equal(context.__classifyRequest(request("/api/stream/ROOM")), "bypass");
  assert.equal(context.__classifyRequest(request("/ws")), "bypass");
  assert.equal(context.__classifyRequest(request("/ws/connection")), "bypass");
  assert.equal(
    context.__classifyRequest({
      method: "GET",
      mode: "cors",
      url: "https://accounts.google.com/gsi/client"
    }),
    "bypass"
  );
  assert.equal(context.__classifyRequest(request("/api/rooms", "cors", "POST")), "bypass");
});

test("service worker handles only navigations, hashed assets and explicit shell resources", () => {
  assert.equal(context.__classifyRequest(request("/room/ABC123", "navigate")), "navigation");
  for (const path of [
    "/assets/index-CL2cNOaE.js",
    "/assets/index-DsnCTq2Q.css",
    "/assets/vision_bundle-9zIsgJJP.js"
  ]) {
    assert.equal(context.__classifyRequest(request(path)), "static-asset");
  }
  for (const path of [
    "/assets/config.js",
    "/assets/runtime.json",
    "/assets/unversioned.css"
  ]) {
    assert.equal(context.__classifyRequest(request(path)), "bypass");
  }
  assert.equal(context.__classifyRequest(request("/brand/syncwatch-mark.png")), "shell-resource");
  assert.equal(context.__classifyRequest(request("/unrelated-data.json")), "bypass");
  assert.deepEqual(
    [...registeredEvents].sort(),
    ["activate", "fetch", "install"]
  );
});

test("service worker cache names use the release version and lookups stay scoped", () => {
  assert.equal(context.__cacheVersion, "v1.0.0");
  assert.doesNotMatch(workerSource, /caches\.match\(/);
  assert.match(workerSource, /shellCache\.match\("\/"\)/);
  assert.match(workerSource, /cache\.match\(request\)/);
});

test("manifest is installable and declares regular plus maskable icons", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8")
  );
  assert.equal(manifest.name, "SyncWatch");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("registration is production-only and never forces an active page reload", () => {
  const registration = readFileSync(
    new URL("../src/registerServiceWorker.ts", import.meta.url),
    "utf8"
  );
  assert.match(registration, /import\.meta\.env\.PROD/);
  assert.match(registration, /register\("\/service-worker\.js"\)/);
  assert.doesNotMatch(registration + workerSource, /location\.reload|window\.location/);
});
