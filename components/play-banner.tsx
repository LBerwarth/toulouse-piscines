"use client";

import { useEffect, useState } from "react";

const PLAY_URL =
  "https://play.google.com/store/apps/details?id=io.github.lberwarth.toulousepiscines";
const DISMISS_KEY = "piscines:play-banner";

/**
 * Invite Play Store, uniquement pour un visiteur Android dans un navigateur —
 * jamais dans l'application installée (TWA ou PWA, qui tournent en
 * « standalone ») ni sur iPhone ou ordinateur. Refermable une fois pour
 * toutes : l'invitation ne doit pas devenir du harcèlement.
 */
export function PlayBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Stockage indisponible (navigation privée…) : afficher quand même.
    }
    const android = /android/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (android && !standalone) setVisible(true);
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
        L&apos;application est sur Google Play — notifications et raccourcis inclus.
      </p>
      <a
        href={PLAY_URL}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 dark:from-pink-600 dark:to-fuchsia-700"
      >
        Installer
      </a>
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
