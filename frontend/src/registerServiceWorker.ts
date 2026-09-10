export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  const register = () => {
    void navigator.serviceWorker
      .register("/service-worker.js")
      .catch(() => {
        console.warn("[SyncWatch PWA] Service worker registration failed.");
      });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
