"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "piscines:ios-banner";

/**
 * Guide d'installation pour iPhone/iPad en navigateur : iOS n'a ni Play Store
 * ni prompt d'installation PWA, il faut passer par Partager → « Sur l'écran
 * d'accueil ». Jamais dans l'app installée, refermable une fois pour toutes.
 */
export function IosBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Stockage indisponible (navigation privée…) : afficher quand même.
    }
    const ua = navigator.userAgent;
    // iPadOS 13+ se présente comme un Mac ; le tactile le distingue.
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (ios && !standalone) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-md shadow-pink-100/50 dark:shadow-none dark:ring-1 dark:ring-white/10">
      <span aria-hidden className="text-xl">
        📲
      </span>
      <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
        Installez l&apos;appli : touchez <ShareIcon /> puis «&nbsp;Sur
        l&apos;écran d&apos;accueil&nbsp;».
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer cette invitation"
        className="shrink-0 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      >
        ✕
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      role="img"
      aria-label="Partager"
      viewBox="0 0 24 24"
      className="inline h-4 w-4 align-[-2px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}
