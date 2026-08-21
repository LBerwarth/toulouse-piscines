// Corps du service worker, servi par app/sw.js/route.ts avec un identifiant de
// build en préfixe (SW_BUILD) : chaque déploiement produit un script différent,
// donc détecté comme une mise à jour par le navigateur.
export const SW_SOURCE = String.raw`
// Le nom du cache est lié au build : à chaque déploiement, l'ancien cache est
// purgé lors de l'activation du nouveau service worker.
const CACHE = "piscines-" + SW_BUILD;

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
      const keys = await caches.keys();
      const oldKeys = keys.filter((k) => k !== CACHE);
      // Reprendre les PAGES de l'ancien cache avant de le purger : le nouveau
      // SW prend le controle immediatement (skipWaiting) et la page se recharge
      // dans la foulee — sans cette reprise, le repli du delai reseau n'existe
      // plus juste apres un deploiement, precisement quand on recharge. Les
      // ressources hachees (/_next/static/) de l'ancien build, elles, ne
      // reserviront jamais : on les laisse mourir avec l'ancien cache.
      const target = await caches.open(CACHE);
      for (const key of oldKeys) {
        const source = await caches.open(key);
        for (const req of await source.keys()) {
          const path = new URL(req.url).pathname;
          if (path.startsWith("/_next/") || path.startsWith("/icon-")) continue;
          if (!(await target.match(req))) {
            const res = await source.match(req);
            if (res) await target.put(req, res);
          }
        }
      }
      await Promise.all(oldKeys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  )
);

// Sur mobile, un fetch peut pendre de longues secondes SANS echouer (reseau
// faible, serveur froid) : la TWA resterait figee sur son ecran de demarrage
// alors qu'une page en cache existe. Passe ce delai, on sert le cache et le
// reseau continue en arriere-plan pour rafraichir la prochaine ouverture.
const NAV_TIMEOUT_MS = 3500;

function offlineResponse() {
  return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Reseau d'abord, mais borne des qu'un repli en cache existe.
async function networkFirst(request, event) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  });

  // Repli du delai : la MEME URL uniquement — les filtres vivent dans la query
  // (raccourcis du lanceur), servir la page d'un autre filtre tromperait.
  const cached = await cache.match(request);
  if (!cached) {
    try {
      return await network;
    } catch {
      // Hors ligne : n'importe quelle variante vaut mieux que rien.
      const any = await cache.match(request, { ignoreSearch: true });
      return any || offlineResponse();
    }
  }

  const winner = await Promise.race([
    network.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS)),
  ]);
  // Reponse reseau saine dans les temps : elle prime. Erreur HTTP (5xx de
  // maintenance...) ou delai depasse : la derniere bonne page fait mieux.
  if (winner && winner.ok) return winner;
  event.waitUntil(network.catch(() => {}));
  return cached;
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
    event.respondWith(networkFirst(request, event));
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
`;
