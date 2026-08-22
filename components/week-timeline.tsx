"use client";

import { useState } from "react";
import type { PoolStatus, TimeSlot, WeekDayRef } from "@/lib/status";
import { TimelineChart, type TimelineEntry } from "./timeline-chart";

const DAY_LABELS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

function formatDateKey(dateKey: number): string {
  const y = Math.floor(dateKey / 10000);
  const m = Math.floor(dateKey / 100) % 100;
  const d = dateKey % 100;
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

export function WeekTimeline({
  pools,
  days,
  isFavorite,
}: {
  pools: PoolStatus[];
  days: WeekDayRef[];
  isFavorite?: (slug: string) => boolean;
}) {
  const todayWeekday = days[0]?.weekday ?? 0;
  const [selected, setSelected] = useState(todayWeekday);

  // Chaque jour de la semaine apparaît exactement une fois dans les 7
  // prochains jours : le bouton « lundi » pointe sur le prochain lundi.
  const index = Math.max(0, days.findIndex((d) => d.weekday === selected));
  const isToday = index === 0;

  const entries: TimelineEntry[] = pools.map((p) => ({
    slug: p.slug,
    name: p.name,
    day: p.week?.[index] ?? null,
  }));

  // Axe horaire calibré sur toute la semaine : il ne saute pas quand on
  // change de jour.
  const rangeSlots: TimeSlot[] = pools
    .flatMap((p) => p.week ?? [])
    .flatMap((d) => [...d.slotsToday, ...d.basins.flatMap((b) => b.slots)]);

  const dateKey = days[index]?.dateKey;

  return (
    <div>
      {/* 7 colonnes égales : tient toujours dans la largeur de l'écran,
          sans conteneur défilant (pas de barre de scroll parasite).
          L'ordre suit `days` — aujourd'hui d'abord, puis les jours suivants :
          on lit ainsi « lundi » comme LE PROCHAIN lundi, pas comme un début
          de semaine calendaire. */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {days.map((d) => {
          const label = DAY_LABELS[d.weekday];
          const isSel = selected === d.weekday;
          return (
            <button
              key={d.dateKey}
              type="button"
              onClick={() => setSelected(d.weekday)}
              aria-pressed={isSel}
              className={`rounded-full px-0 py-1 text-center text-xs transition-colors ${
                isSel
                  ? "bg-gradient-to-r from-pink-500 to-fuchsia-600 font-semibold text-white shadow-sm dark:from-pink-600 dark:to-fuchsia-700"
                  : "bg-fuchsia-50 font-medium text-fuchsia-900 hover:bg-fuchsia-100 dark:bg-fuchsia-400/10 dark:text-fuchsia-100 dark:hover:bg-fuchsia-400/20"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {dateKey && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="capitalize">{formatDateKey(dateKey)}</span>
          {isToday && " (aujourd'hui)"}
        </p>
      )}

      <TimelineChart
        entries={entries}
        showNow={isToday}
        rangeSlots={rangeSlots}
        isFavorite={isFavorite}
      />
    </div>
  );
}
