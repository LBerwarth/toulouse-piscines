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

export function WeekTimeline({ pools, days }: { pools: PoolStatus[]; days: WeekDayRef[] }) {
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
    <section className="mb-6 rounded-3xl bg-white p-4 shadow-lg shadow-pink-100/60 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-800">
        Horaires par jour
      </h2>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {DAY_LABELS.map((label, wd) => {
          const isSel = selected === wd;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setSelected(wd)}
              aria-pressed={isSel}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
                isSel
                  ? "bg-gradient-to-r from-pink-500 to-fuchsia-600 font-semibold text-white shadow-sm"
                  : "bg-fuchsia-50 font-medium text-fuchsia-900 hover:bg-fuchsia-100"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {dateKey && (
        <p className="mt-2 text-xs text-slate-500">
          <span className="capitalize">{formatDateKey(dateKey)}</span>
          {isToday && " (aujourd'hui)"}
        </p>
      )}

      <TimelineChart entries={entries} showNow={isToday} rangeSlots={rangeSlots} />
    </section>
  );
}
