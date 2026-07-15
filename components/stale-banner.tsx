"use client";

import { useSyncExternalStore } from "react";

/**
 * Délai de jour au-delà duquel les horaires affichés sont jugés potentiellement
 * périmés. Le cron rafraîchit ~15 min entre 7 h et 19 h : un âge supérieur
 * signifie que les rafraîchissements échouent (source indisponible). La marge
 * évite tout faux positif sur des données simplement « en fin de fenêtre ».
 */
const STALE_AFTER_MS = 45 * 60_000;

/** Minute locale à Toulouse (0–1439). L'appareil peut être sur un autre fuseau. */
function toulouseMinutes(nowMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h === 24 ? 0 : h) * 60 + m;
}

/**
 * Âge toléré avant le bandeau. Le cron est en pause de ~19 h à ~7 h (cf.
 * db/cron_scrape.sql) : le soir et la nuit, le cache du soir est NORMALEMENT
 * vieux — la tolérance suit le temps écoulé depuis 19 h, plus la marge de jour.
 * La journée reprend à 8 h (et non 7 h) : marge pour que le premier passage
 * du matin ait réellement réécrit le cache (dérive été/hiver comprise).
 */
function staleAfterMs(nowMs: number): number {
  const m = toulouseMinutes(nowMs);
  if (m >= 8 * 60 && m < 19 * 60) return STALE_AFTER_MS;
  const sinceStop = m >= 19 * 60 ? m - 19 * 60 : m + 5 * 60;
  return sinceStop * 60_000 + STALE_AFTER_MS;
}

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
  const nowMs = Number(minute) * 60_000;
  const stale = nowMs - new Date(updatedAt).getTime() > staleAfterMs(nowMs);
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
