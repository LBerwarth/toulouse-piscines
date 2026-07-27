"use client";

import { useSyncExternalStore } from "react";
import { THEME_COLOR, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const CYCLE: Theme[] = ["system", "light", "dark"];

const LABELS: Record<Theme, { icon: string; name: string }> = {
  system: { icon: "🌗", name: "automatique" },
  light: { icon: "☀️", name: "clair" },
  dark: { icon: "🌙", name: "sombre" },
};

// « storage » ne se déclenche que dans les AUTRES onglets : un événement local
// tient à jour le bouton de l'onglet courant.
const LOCAL_EVENT = "themechange";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

// Rendu serveur et hydratation : « automatique ». Les couleurs de la page sont
// déjà bonnes (script du <head>) ; seule l'icône se corrige après hydratation.
const getServerSnapshot = (): Theme => "system";

/**
 * Les deux balises theme-color posées par le viewport sont liées à une media
 * query, donc inopérantes dès que l'utilisateur force un thème : on réécrit
 * leur contenu pour que la barre d'adresse suive le choix.
 */
function syncThemeColor(theme: Theme): void {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const own = (meta.getAttribute("media") ?? "").includes("dark")
      ? THEME_COLOR.dark
      : THEME_COLOR.light;
    meta.content = theme === "system" ? own : THEME_COLOR[theme];
  });
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Stockage refusé (navigation privée) : le choix ne vaut que pour la page.
  }
  syncThemeColor(theme);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/** Bascule clair / sombre / automatique, à placer dans un parent positionné. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
  const label = `Thème : ${LABELS[theme].name} — passer en ${LABELS[next].name}`;

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={label}
      title={label}
      className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-base leading-none transition-colors hover:bg-white/35 sm:right-5 sm:top-5"
    >
      <span aria-hidden>{LABELS[theme].icon}</span>
    </button>
  );
}
