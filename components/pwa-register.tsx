"use client";

import { useEffect } from "react";

/** Enregistre le service worker (rend l'application installable). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // updateViaCache: "none" — le script du SW est toujours revalidé auprès du
    // serveur, jamais servi depuis le cache HTTP (on récupère vite une mise à jour).
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Échec silencieux : l'application fonctionne sans le service worker.
      });
  }, []);
  return null;
}
