"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  disablePush,
  enablePush,
  isSubscribed,
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
    if (e.key === LS_KEY) onChange();
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

export interface PoolNotifications {
  favorites: string[];
  toggleFavorite: (slug: string) => void;
  isFavorite: (slug: string) => boolean;
  supported: boolean;
  subscribed: boolean;
  busy: boolean;
  denied: boolean;
  toggleNotifications: () => void;
}

export function usePoolNotifications(): PoolNotifications {
  const favorites = useSyncExternalStore(subscribeFavorites, readFavorites, favoritesServerSnapshot);
  const supported = useSyncExternalStore(noopSubscribe, pushSupported, supportedServerSnapshot);
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
      if (subscribed) syncPools(next);
    },
    [subscribed]
  );

  const isFavorite = useCallback((slug: string) => favorites.includes(slug), [favorites]);

  const toggleNotifications = useCallback(() => {
    setBusy(true);
    (async () => {
      try {
        if (subscribed) {
          await disablePush();
          setSubscribed(false);
        } else {
          const r = await enablePush(favorites);
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
  }, [subscribed, favorites]);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    supported,
    subscribed,
    busy,
    denied,
    toggleNotifications,
  };
}
