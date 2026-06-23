"use client";

import { useSyncExternalStore } from "react";

/**
 * Au-delà de ce délai, les horaires affichés sont considérés comme potentiellement
 * périmés. Le cache est rafraîchi au plus toutes les 30 min (cf. TTL_MS) : un âge
 * supérieur signifie qu'un rafraîchissement a échoué (source indisponible). La
 * marge évite tout faux positif sur des données simplement « en fin de fenêtre ».
 */
const STALE_AFTER_MS = 45 * 60_000;

// Store externe : notifie au changement d'état réseau et chaque minute (pour
// réévaluer l'ancienneté tant que l'onglet reste ouvert).
function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  const id = window.setInterval(callback, 60_000);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
    window.clearInterval(id);
  };
}

// Snapshot stable : « en ligne ? » + minute courante. Identique d'un rendu à
// l'autre tant que ni l'état réseau ni la minute ne changent (requis par
// useSyncExternalStore pour éviter les rendus en boucle).
function getSnapshot(): string {
  return `${navigator.onLine ? 1 : 0}:${Math.floor(Date.now() / 60_000)}`;
}

// Côté serveur (et premier rendu d'hydratation) : sentinelle → bandeau masqué,
// l'état réseau et l'horloge n'étant connus que dans le navigateur.
function getServerSnapshot(): string {
  return "server";
}

/**
 * Bandeau d'avertissement quand les horaires affichés peuvent être périmés :
 * - appareil hors ligne → données servies par le cache du navigateur ;
 * - source officielle indisponible depuis un moment → le serveur sert le dernier
 *   bon rapport, dont l'âge dépasse la fenêtre de rafraîchissement.
 *
 * Masqué tant que tout est normal.
 */
export function StaleBanner({
  updatedAt,
  updatedLabel,
}: {
  updatedAt: string;
  updatedLabel: string;
}) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (snapshot === "server") return null; // SSR / premier rendu : on attend le client

  // « en ligne ? » + minute courante, lus depuis le snapshot (rendu pur : pas
  // d'appel direct à Date.now() ici).
  const [online, minute] = snapshot.split(":");
  const offline = online === "0";
  const stale = Number(minute) * 60_000 - new Date(updatedAt).getTime() > STALE_AFTER_MS;
  if (!offline && !stale) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
    >
      <span aria-hidden className="mt-0.5 text-base leading-none">
        {offline ? "📡" : "⚠️"}
      </span>
      <p>
        {offline
          ? "Vous êtes hors ligne. "
          : "La source officielle est momentanément indisponible. "}
        Horaires enregistrés le {updatedLabel} — ils ont pu changer depuis.
        Vérifiez les informations critiques sur la page officielle de chaque
        piscine.
      </p>
    </div>
  );
}
