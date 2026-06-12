// Service worker minimal.
//
// Objectif : rendre l'application installable (PWA / Play Store via TWA) SANS
// jamais servir d'horaires périmés. On ne met donc rien en cache : tout passe
// par le réseau. Seule la navigation a un repli hors-ligne, qui invite
// simplement à se reconnecter (il n'affiche aucune donnée potentiellement
// obsolète).

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // réseau normal pour le reste
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
            "<title>Hors ligne</title>" +
            "<div style=\"font-family:system-ui;padding:2rem;text-align:center;color:#6d28d9\">" +
            "<h1>Hors ligne</h1><p>Reconnectez-vous pour voir les horaires à jour des piscines.</p></div>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        )
    )
  );
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
