"use client";

import { useEffect } from "react";

/** Enregistre le service worker (rend l'application installable). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Échec silencieux : l'application fonctionne sans le service worker.
    });
  }, []);
  return null;
}
