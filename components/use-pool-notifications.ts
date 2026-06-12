"use client";

import { useCallback, useEffect, useState } from "react";
import {
  disablePush,
  enablePush,
  isSubscribed,
  pushSupported,
  syncPools,
} from "@/lib/push-client";

const LS_KEY = "piscines:favorites";

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
  const [favorites, setFavorites] = useState<string[]>([]);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    setSupported(pushSupported());
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setFavorites(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    isSubscribed().then(setSubscribed);
  }, []);

  const toggleFavorite = useCallback(
    (slug: string) => {
      setFavorites((prev) => {
        const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        if (subscribed) syncPools(next);
        return next;
      });
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
