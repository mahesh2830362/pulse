// Pulse Service Worker — handles push notifications + offline article caching

const ARTICLE_CACHE = "pulse-articles-v1";
const MAX_CACHED_ARTICLES = 100;

// ── Push notifications ──

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-72.png",
    tag: data.tag || "pulse-notification",
    data: { url: data.url || "/dashboard" },
    actions: [
      { action: "open", title: "Read" },
      { action: "dismiss", title: "Dismiss" },
    ],
    vibrate: [200, 100, 200],
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Pulse", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Offline caching ──
// NOTE: Authenticated API endpoints (/api/items, /api/bookmarks) are NOT cached
// in the service worker because responses are user-specific. Caching them by URL
// alone risks serving one user's data to another on shared browsers.
// Only cache static assets and explicitly client-pushed article data.

// Listen for messages from the client to cache specific articles
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CACHE_ARTICLE") {
    const { url, data } = event.data;
    event.waitUntil(
      caches.open(ARTICLE_CACHE).then((cache) =>
        cache.put(
          new Request(url),
          new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
          })
        )
      )
    );
  }
});

// ── Activation ──

self.addEventListener("activate", (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const toDelete = cacheNames.filter(
        (name) => name.startsWith("pulse-") && name !== ARTICLE_CACHE
      );
      return Promise.all([
        ...toDelete.map((name) => caches.delete(name)),
        self.clients.claim(),
      ]);
    })
  );
});

// Trim cache to MAX_CACHED_ARTICLES on a periodic basis
async function trimCache() {
  const cache = await caches.open(ARTICLE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_CACHED_ARTICLES) {
    const toRemove = keys.slice(0, keys.length - MAX_CACHED_ARTICLES);
    await Promise.all(toRemove.map((key) => cache.delete(key)));
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "trim-cache") {
    event.waitUntil(trimCache());
  }
});
