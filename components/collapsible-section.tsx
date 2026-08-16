"use client";

import { useEffect, useState } from "react";

function readStored(key: string): boolean | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

/**
 * Bloc repliable dont l'état survit d'une visite à l'autre (localStorage).
 * Rendu serveur : ouvert, l'état mémorisé s'applique à l'hydratation.
 */
export function CollapsibleSection({
  title,
  storageKey,
  variant = "card",
  hashPrefix,
  children,
}: {
  title: string;
  storageKey: string;
  /** « card » : carte arrondie comme les autres blocs ; « plain » : sans fond. */
  variant?: "card" | "plain";
  /** Rouvre le bloc quand l'ancre visée (#…) commence par ce préfixe. */
  hashPrefix?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen((v) => readStored(storageKey) ?? v);
  }, [storageKey]);

  useEffect(() => {
    if (!hashPrefix) return;
    const openOnHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash.startsWith(hashPrefix)) return;
      setOpen(true);
      // Le contenu vient d'apparaître : refaire le saut vers l'ancre.
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
    };
    openOnHash();
    window.addEventListener("hashchange", openOnHash);
    return () => window.removeEventListener("hashchange", openOnHash);
  }, [hashPrefix]);

  // Seul un clic mémorise le choix — l'ouverture par ancre reste passagère.
  function toggle() {
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const contentId = `${storageKey}-contenu`;

  return (
    <section
      className={
        variant === "card"
          ? "mb-6 overflow-hidden rounded-3xl bg-card shadow-lg shadow-pink-100/60 dark:shadow-none dark:ring-1 dark:ring-white/10"
          : "mb-6"
      }
    >
      <h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className={
            variant === "card"
              ? "flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
              : "flex items-center gap-2 py-2 text-left"
          }
        >
          <span className="text-sm font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
            {title}
          </span>
          <span
            aria-hidden
            className={`shrink-0 text-xs text-violet-500 transition-transform dark:text-violet-300 ${
              open ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>
      </h2>

      {open && (
        <div id={contentId} className={variant === "card" ? "px-4 pb-4 sm:px-5 sm:pb-5" : ""}>
          {children}
        </div>
      )}
    </section>
  );
}
