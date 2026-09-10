const CACHE_VERSION = "v0.9.6";
const SHELL_CACHE = `syncwatch-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `syncwatch-static-${CACHE_VERSION}`;
const APP_SHELL_FILES = [
  "/",
  "/manifest.webmanifest",
  "/brand/syncwatch-mark.png",
  "/pwa/apple-touch-icon.png",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-512.png"
];

function isViteHashedAsset(pathname) {
  if (!pathname.startsWith("/assets/")) return false;

  const basename = pathname.slice(pathname.lastIndexOf("/") + 1);
  return /-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/.test(basename);
}

function classifyRequest(request, scopeOrigin = self.location.origin) {
  if (request.method !== "GET") return "bypass";

  const url = new URL(request.url);
  if (url.origin !== scopeOrigin) return "bypass";
  if (
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/ws" ||
    url.pathname.startsWith("/ws/")
  ) {
    return "bypass";
  }
  if (request.mode === "navigate") return "navigation";
  if (isViteHashedAsset(url.pathname)) return "static-asset";
  if (APP_SHELL_FILES.includes(url.pathname)) return "shell-resource";
  return "bypass";
}

async function cacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(APP_SHELL_FILES.map((path) => cache.add(path)));
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("text/html")) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    const shellCache = await caches.open(SHELL_CACHE);
    const cached = await shellCache.match("/");
    return cached || new Response("SyncWatch requires a network connection.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const currentCaches = new Set([SHELL_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith("syncwatch-") && !currentCaches.has(name))
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const strategy = classifyRequest(event.request);
  if (strategy === "navigation") {
    event.respondWith(networkFirstNavigation(event.request));
  } else if (strategy === "static-asset") {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
  } else if (strategy === "shell-resource") {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
  }
});
