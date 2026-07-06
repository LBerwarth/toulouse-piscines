"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  disablePush,
  enablePush,
  isSubscribed,
  needsIosInstall,
  pushSupported,
  syncPools,
} from "@/lib/push-client";

const LS_KEY = "piscines:favorites";

// `supported` est une détection de fonctionnalité du navigateur : valeur stable,
// indisponible au rendu serveur. useSyncExternalStore évite un setState en effet
// (et le décalage d'hydratation) — false côté serveur, réel côté client.
const noopSubscribe = () => () => {};
const supportedServerSnapshot = () => false;

// Favoris persistés en localStorage, exposés via useSyncExternalStore : pas de
// setState en effet, et synchronisation entre onglets « gratuite ». getSnapshot
// renvoie une référence stable tant que la valeur stockée ne change pas.
const EMPTY_FAVORITES: string[] = [];
let favCache: string[] = EMPTY_FAVORITES;
let favCacheRaw: string | null = null;

function readFavorites(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LS_KEY);
  } catch {
    raw = null;
  }
  if (raw !== favCacheRaw) {
    favCacheRaw = raw;
    try {
      favCache = raw ? (JSON.parse(raw) as string[]) : EMPTY_FAVORITES;
    } catch {
      favCache = EMPTY_FAVORITES;
    }
  }
  return favCache;
}

const favListeners = new Set<() => void>();

function subscribeFavorites(onChange: () => void): () => void {
  favListeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_KEY || e.key === SCOPE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    favListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function writeFavorites(next: string[]): void {
  favCache = next;
  try {
    favCacheRaw = JSON.stringify(next);
    localStorage.setItem(LS_KEY, favCacheRaw);
  } catch {
    /* ignore */
  }
  favListeners.forEach((l) => l());
}

const favoritesServerSnapshot = () => EMPTY_FAVORITES;

// Portée des alertes, choisie EXPLICITEMENT par l'utilisateur (dialogue) :
// « starred » = seulement les piscines ★, « all » = toutes, null = jamais
// choisi (traité comme « toutes »). Avant, poser une ★ restreignait la portée
// en silence — surprise garantie pour qui épingle juste une piscine en tête.
export type NotifScope = "all" | "starred";
const SCOPE_KEY = "piscines:notif-scope";

function readScope(): NotifScope | null {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    return raw === "all" || raw === "starred" ? raw : null;
  } catch {
    return null;
  }
}

function writeScope(next: NotifScope | null): void {
  try {
    if (next === null) localStorage.removeItem(SCOPE_KEY);
    else localStorage.setItem(SCOPE_KEY, next);
  } catch {
    /* ignore */
  }
  favListeners.forEach((l) => l());
}

const scopeServerSnapshot = () => null;

export interface PoolNotifications {
  favorites: string[];
  toggleFavorite: (slug: string) => void;
  isFavorite: (slug: string) => boolean;
  supported: boolean;
  /** iOS dans le navigateur : push possible seulement après ajout à l'écran d'accueil */
  needsInstall: boolean;
  subscribed: boolean;
  busy: boolean;
  denied: boolean;
  toggleNotifications: () => void;
  /** Portée choisie des alertes (null = pas encore choisie, vaut « toutes ») */
  scope: NotifScope | null;
  /** Afficher le dialogue « toutes ou seulement vos ★ ? » */
  scopePrompt: boolean;
  chooseScope: (scope: NotifScope) => void;
}

export function usePoolNotifications(): PoolNotifications {
  const favorites = useSyncExternalStore(subscribeFavorites, readFavorites, favoritesServerSnapshot);
  const supported = useSyncExternalStore(noopSubscribe, pushSupported, supportedServerSnapshot);
  const needsInstall = useSyncExternalStore(noopSubscribe, needsIosInstall, supportedServerSnapshot);
  const scope = useSyncExternalStore(subscribeFavorites, readScope, scopeServerSnapshot);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    isSubscribed().then(setSubscribed);
  }, []);

  const toggleFavorite = useCallback(
    (slug: string) => {
      const prev = readFavorites();
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      writeFavorites(next);
      // La ★ ne change plus la portée des alertes en silence : le serveur n'est
      // synchronisé que si l'utilisateur a explicitement choisi « seulement ★ ».
      if (!subscribed || scope !== "starred") return;
      if (next.length === 0) {
        // Plus aucune ★ : « pools vide » signifierait « toutes » côté serveur —
        // on efface le choix et on reposera la question à la prochaine ★.
        writeScope(null);
        syncPools([]);
      } else {
        syncPools(next);
      }
    },
    [subscribed, scope]
  );

  const chooseScope = useCallback((next: NotifScope) => {
    writeScope(next);
    syncPools(next === "starred" ? readFavorites() : []);
  }, []);

  const isFavorite = useCallback((slug: string) => favorites.includes(slug), [favorites]);

  const toggleNotifications = useCallback(() => {
    setBusy(true);
    (async () => {
      try {
        if (subscribed) {
          await disablePush();
          setSubscribed(false);
        } else {
          const r = await enablePush(scope === "starred" ? favorites : []);
          if (r === "ok") {
            setSubscribed(true);
            setDenied(false);
          } else if (r === "denied") {
            setDenied(true);
          }
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [subscribed, favorites, scope]);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    supported,
    needsInstall,
    subscribed,
    busy,
    denied,
    toggleNotifications,
    scope,
    scopePrompt: subscribed && favorites.length > 0 && scope === null,
    chooseScope,
  };
}
