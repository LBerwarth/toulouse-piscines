// Service worker : application installable (PWA / Play Store via TWA) ET
// disponible hors ligne.
//
// On met en cache la dernière page consultée et les ressources statiques, afin
// d'afficher les derniers horaires connus quand le réseau est absent — plutôt
// qu'un simple message « hors ligne ». Le réseau reste TOUJOURS prioritaire : la
// page n'est servie depuis le cache qu'en cas d'échec réseau. Un bandeau dans
// l'application prévient alors que les horaires peuvent être périmés.

// Incrémenter à chaque changement de stratégie pour purger les anciens caches.
const CACHE = "piscines-v1";

const OFFLINE_HTML =
  "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
  "<title>Hors ligne</title>" +
  "<div style=\"font-family:system-ui;padding:2rem;text-align:center;color:#6d28d9\">" +
  "<h1>Hors ligne</h1><p>Ouvrez l'application au moins une fois en ligne pour " +
  "consulter ensuite les derniers horaires enregistrés.</p></div>";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Purge des caches d'une version antérieure.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  )
);

// Réseau d'abord ; en cas d'échec, dernière réponse en cache (ou repli minimal).
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    return (
      cached ||
      new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    );
  }
}

// Cache d'abord (ressources versionnées, au nom haché : sûres à figer).
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POST (abonnement push…) : réseau direct

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // tiers : réseau direct

  // La page elle-même : réseau d'abord, repli sur la dernière page en cache.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Ressources statiques nécessaires à l'affichage/l'hydratation hors ligne.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname.startsWith("/manifest") ||
    url.pathname === "/eau.jpg"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Le reste (API, données dynamiques) : réseau normal, non mis en cache.
});

// --- Notifications push (fermetures exceptionnelles) ---

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Piscines de Toulouse";
  const options = {
    body: data.body || "Fermeture exceptionnelle signalée.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    lang: "fr",
    tag: data.slug || "piscine",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) return w.focus();
      }
      return clients.openWindow(url);
    })
  );
});
