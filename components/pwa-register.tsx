"use client";

import { useEffect } from "react";

/** Enregistre le service worker (application installable) et recharge la page dès
 *  qu'une nouvelle version prend le contrôle, pour éviter d'avoir à rafraîchir
 *  plusieurs fois après un déploiement. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Ne recharger que sur une vraie mise à jour : au tout premier install, le SW
    // prend le contrôle sans qu'il y ait d'ancienne version à remplacer.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let registration: ServiceWorkerRegistration | undefined;
    // updateViaCache: "none" — le script du SW est toujours revalidé auprès du
    // serveur, jamais servi depuis le cache HTTP (on récupère vite une mise à jour).
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
      })
      .catch(() => {
        // Échec silencieux : l'application fonctionne sans le service worker.
      });

    // Revérifier une nouvelle version à chaque retour au premier plan.
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
