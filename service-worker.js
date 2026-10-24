const CACHE_NAME = "et-survey-pwa-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./assets/et-survey-logo.png",
  "./assets/et-survey-favicon-32.png",
  "./assets/et-survey-favicon-192.png",
  "./assets/et-survey-apple-touch-icon.png",
  "./assets/et-survey-pwa-512.png"
];
const SHELL_ASSETS = new Set([
  "index.html",
  "offline.html",
  "styles.css",
  "app.js",
  "config.js",
  "manifest.webmanifest",
  "assets/et-survey-logo.png",
  "assets/et-survey-favicon-32.png",
  "assets/et-survey-favicon-192.png",
  "assets/et-survey-apple-touch-icon.png",
  "assets/et-survey-pwa-512.png"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("et-survey-pwa-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(new URL("./offline.html", scopeUrl).href)) || cache.match(request);
      })
    );
    return;
  }

  const relativePath = requestUrl.pathname.slice(scopeUrl.pathname.length);
  if (!SHELL_ASSETS.has(relativePath)) return;

  event.respondWith(
    fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || Response.error();
    })
  );
});
