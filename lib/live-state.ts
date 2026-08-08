import type { PoolStatus } from "./status";

/** État du jour d'une piscine à l'heure courante. Partagé par la liste et la carte. */
export type LiveState =
  | { kind: "open"; until: string }
  | { kind: "later"; at: string }
  | { kind: "done" }
  | { kind: "closed"; reason: string | null }
  | { kind: "unknown" };

/** `now` vaut null au rendu serveur et à l'hydratation : l'heure reste inconnue. */
export function liveState(pool: PoolStatus, now: string | null): LiveState {
  const day = pool.week?.[0];
  if (!day) return { kind: "unknown" };
  if (!day.openToday || day.slotsToday.length === 0) {
    return { kind: "closed", reason: day.closureReason };
  }
  if (now === null) return { kind: "unknown" };
  for (const slot of day.slotsToday) {
    if (now >= slot.start && now < slot.end) return { kind: "open", until: slot.end };
  }
  const next = day.slotsToday.find((s) => now < s.start);
  if (next) return { kind: "later", at: next.start };
  return { kind: "done" };
}
