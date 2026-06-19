"use client";

import { useState } from "react";
import type { DayStatus, PoolStatus, TimeSlot, WeekDayRef } from "@/lib/status";
import { classifyBasinEnv, type Environment } from "@/lib/environment";
import { WeekTimeline } from "./week-timeline";
import { PoolList } from "./pool-list";
import { usePoolNotifications } from "./use-pool-notifications";

type Filter = "all" | Environment;

const OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "indoor", label: "Intérieur" },
  { value: "outdoor", label: "Plein air" },
];

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function mergeSlots(slots: TimeSlot[]): TimeSlot[] {
  const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
  const merged: TimeSlot[] = [];
  for (const slot of sorted) {
    const last = merged[merged.length - 1];
    if (last && toMinutes(slot.start) <= toMinutes(last.end)) {
      if (toMinutes(slot.end) > toMinutes(last.end)) last.end = slot.end;
    } else {
      merged.push({ ...slot });
    }
  }
  return merged;
}

/** Ne conserve, pour une piscine mixte, que les bassins du type demandé. */
function filterDay(day: DayStatus, env: Environment): DayStatus {
  const basins = day.basins.filter((b) => classifyBasinEnv(b.label) === env);
  const slots = mergeSlots(basins.flatMap((b) => b.slots));
  return {
    ...day,
    basins,
    slotsToday: slots,
    openToday: slots.length > 0,
    closureReason: slots.length > 0 ? null : basins.find((b) => b.note)?.note ?? day.closureReason,
  };
}

function filterPools(pools: PoolStatus[], filter: Filter): PoolStatus[] {
  if (filter === "all") return pools;
  const out: PoolStatus[] = [];
  for (const pool of pools) {
    if (pool.env !== "mixed") {
      if (pool.env === filter) out.push(pool); // piscine purement intérieure / extérieure
      continue;
    }
    // Piscine mixte : on ne garde que les bassins correspondants
    if (!pool.week) {
      out.push(pool);
      continue;
    }
    out.push({ ...pool, week: pool.week.map((d) => filterDay(d, filter)) });
  }
  return out;
}

export function PoolsView({ pools, days }: { pools: PoolStatus[]; days: WeekDayRef[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = filterPools(pools, filter);
  const notif = usePoolNotifications();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-violet-800/70">
            Bassins
          </span>
          <div className="flex gap-1.5">
            {OPTIONS.map((opt) => {
              const isSel = filter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  aria-pressed={isSel}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    isSel
                      ? "bg-gradient-to-r from-pink-500 to-fuchsia-600 font-semibold text-white shadow-sm"
                      : "bg-white/70 font-medium text-fuchsia-900 hover:bg-fuchsia-100"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {notif.supported && (
          <button
            type="button"
            onClick={notif.toggleNotifications}
            disabled={notif.busy}
            aria-pressed={notif.subscribed}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
              notif.subscribed
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-white/70 text-violet-800 hover:bg-fuchsia-100"
            }`}
            title="Recevoir une notification en cas de fermeture ou de changement exceptionnel (horaires…)"
          >
            <span aria-hidden>{notif.subscribed ? "🔔" : "🔕"}</span>
            {notif.subscribed ? "Alertes activées" : "M'alerter"}
          </button>
        )}
      </div>

      {/* Toujours visible (pas seulement au survol) : sur mobile il n'y a pas
          d'infobulle, c'est ici qu'on explique l'objet des notifications. */}
      {notif.supported && (
        <p className="-mt-2 mb-4 text-xs text-slate-500">
          {notif.denied
            ? "Notifications bloquées par le navigateur — autorisez-les dans les réglages pour être alerté·e."
            : notif.subscribed
              ? notif.favorites.length > 0
                ? "Vous serez alerté·e des fermetures et changements exceptionnels de vos piscines ★."
                : "Vous serez alerté·e des fermetures et changements exceptionnels de toutes les piscines (ajoutez des ★ pour filtrer)."
              : "Activez les alertes pour être prévenu·e des fermetures et changements exceptionnels (horaires prolongés, canicule…)."}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="mb-6 rounded-3xl bg-white p-6 text-center text-sm text-slate-500 shadow-lg shadow-pink-100/60">
          Aucune piscine de ce type.
        </p>
      ) : (
        <>
          <WeekTimeline pools={filtered} days={days} isFavorite={notif.isFavorite} />
          <PoolList
            pools={filtered}
            isFavorite={notif.isFavorite}
            onToggleFavorite={notif.toggleFavorite}
          />
        </>
      )}
    </>
  );
}
