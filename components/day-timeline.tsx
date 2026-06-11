"use client";

import { useEffect, useState } from "react";
import type { BasinSchedule, PoolStatus, TimeSlot } from "@/lib/status";

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function nowMinutesInToulouse(): number {
  const hm = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return toMinutes(hm);
}

type Row =
  | { kind: "group"; key: string; label: string }
  | { kind: "bar"; key: string; label: string; sub: boolean; slots: TimeSlot[]; tip: string }
  | { kind: "off"; key: string; label: string; sub: boolean; note: string };

function shortNote(note: string | null, fallback: string): string {
  const n = note ?? fallback;
  return n.length > 60 ? `${n.slice(0, 57)}…` : n;
}

function basinRow(poolName: string, slug: string, basin: BasinSchedule): Row {
  const label = basin.label ?? "bassin";
  const key = `${slug}:${label}`;
  if (basin.slots.length > 0) {
    return { kind: "bar", key, label, sub: true, slots: basin.slots, tip: `${poolName} — ${label}` };
  }
  return { kind: "off", key, label, sub: true, note: shortNote(basin.note, "fermé") };
}

function buildRows(pools: PoolStatus[]): Row[] {
  // Ordre alphabétique : chaque piscine garde sa place d'un jour à l'autre,
  // et les paires comme Nakache été / hiver restent voisines.
  const withData = pools.filter((p) => p.day).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const unavailable = pools.filter((p) => !p.day).sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const rows: Row[] = [];
  for (const pool of withData) {
    const day = pool.day!;
    const labeled = day.basins.filter((b) => b.label !== null);
    const main = day.basins.find((b) => b.label === null);

    if (day.basins.length <= 1) {
      // Bassin unique
      if (day.openToday) {
        rows.push({
          kind: "bar",
          key: pool.slug,
          label: pool.name,
          sub: false,
          slots: day.slotsToday,
          tip: pool.name,
        });
      } else {
        rows.push({
          kind: "off",
          key: pool.slug,
          label: pool.name,
          sub: false,
          note: shortNote(day.closureReason, "fermée aujourd'hui"),
        });
      }
    } else if (main) {
      // Horaires principaux + bassins annexes (ex. Toulouse Lautrec, Alex Jany)
      if (main.slots.length > 0) {
        rows.push({
          kind: "bar",
          key: pool.slug,
          label: pool.name,
          sub: false,
          slots: main.slots,
          tip: pool.name,
        });
      } else {
        rows.push({
          kind: "off",
          key: pool.slug,
          label: pool.name,
          sub: false,
          note: shortNote(main.note ?? day.closureReason, "fermée aujourd'hui"),
        });
      }
      for (const basin of labeled) rows.push(basinRow(pool.name, pool.slug, basin));
    } else {
      // Tous les bassins sont nommés (ex. Bellevue)
      rows.push({ kind: "group", key: pool.slug, label: pool.name });
      for (const basin of day.basins) rows.push(basinRow(pool.name, pool.slug, basin));
    }
  }
  for (const pool of unavailable) {
    rows.push({
      kind: "off",
      key: pool.slug,
      label: pool.name,
      sub: false,
      note: "données indisponibles",
    });
  }
  return rows;
}

export function DayTimeline({ pools }: { pools: PoolStatus[] }) {
  // Calculé après montage pour rester juste malgré le cache de 30 min (et
  // éviter un décalage d'hydratation).
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    setNowMin(nowMinutesInToulouse());
    const timer = setInterval(() => setNowMin(nowMinutesInToulouse()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const rows = buildRows(pools);
  const allSlots = rows.flatMap((r) => (r.kind === "bar" ? r.slots : []));

  // Plage horaire du graphique : de l'heure pleine avant la première
  // ouverture à l'heure pleine après la dernière fermeture.
  let earliest = Infinity;
  let latest = -Infinity;
  for (const s of allSlots) {
    earliest = Math.min(earliest, toMinutes(s.start));
    latest = Math.max(latest, toMinutes(s.end));
  }
  const rangeStart = Number.isFinite(earliest) ? Math.floor(earliest / 60) * 60 : 8 * 60;
  const rangeEnd = Number.isFinite(latest) ? Math.ceil(latest / 60) * 60 : 20 * 60;
  const span = Math.max(rangeEnd - rangeStart, 60);
  const pct = (min: number) => ((min - rangeStart) / span) * 100;

  const tickStep = span > 10 * 60 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = rangeStart; t <= rangeEnd; t += tickStep) ticks.push(t);

  const showNowLine = nowMin !== null && nowMin >= rangeStart && nowMin <= rangeEnd;

  const Track = ({ children }: { children: React.ReactNode }) => (
    <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-fuchsia-50">
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute inset-y-0 w-px bg-fuchsia-100"
          style={{ left: `${pct(t)}%` }}
        />
      ))}
      {children}
      {showNowLine && (
        <span
          className="absolute inset-y-0 w-0.5 rounded-full bg-violet-950"
          style={{ left: `${pct(nowMin!)}%` }}
        />
      )}
    </div>
  );

  return (
    <section className="mb-6 rounded-3xl bg-white p-4 shadow-lg shadow-pink-100/60 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-800">
        Aujourd&apos;hui en un coup d&apos;œil
      </h2>

      <div className="mt-3 space-y-2">
        {/* Échelle des heures */}
        <div className="relative h-4">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 text-[10px] font-medium tabular-nums text-violet-700/60"
              style={{ left: `${pct(t)}%` }}
            >
              {t / 60}h
            </span>
          ))}
        </div>

        {/* Nom complet au-dessus de chaque barre — jamais tronqué */}
        {rows.map((row) => {
          if (row.kind === "group") {
            return (
              <p key={row.key} className="pt-1.5 text-xs font-semibold text-slate-800">
                {row.label}
              </p>
            );
          }
          const label = (
            <p
              className={
                row.sub
                  ? "mb-0.5 pl-3 text-[11px] leading-snug text-slate-500"
                  : "mb-0.5 text-xs font-medium leading-snug text-slate-700"
              }
            >
              {row.label}
            </p>
          );
          const indent = row.sub ? "pl-3" : "";
          if (row.kind === "off") {
            return (
              <div key={row.key}>
                {label}
                <div className={indent}>
                  <Track>
                    <span
                      className="absolute inset-y-0 left-1.5 flex items-center truncate pr-2 text-[10px] italic text-slate-400"
                      title={row.note}
                    >
                      {row.note}
                    </span>
                  </Track>
                </div>
              </div>
            );
          }
          return (
            <div key={row.key}>
              {label}
              <div className={indent}>
                <Track>
                  {row.slots.map((slot) => {
                    const s = toMinutes(slot.start);
                    const e = toMinutes(slot.end);
                    const openNow = nowMin !== null && nowMin >= s && nowMin < e;
                    return (
                      <span
                        key={`${slot.start}-${slot.end}`}
                        className={`absolute inset-y-0.5 rounded ${
                          openNow ? "bg-gradient-to-r from-violet-500 to-purple-600" : "bg-gradient-to-r from-pink-400 to-fuchsia-500"
                        }`}
                        style={{ left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%` }}
                        title={`${row.tip} : ${slot.start}–${slot.end}`}
                      />
                    );
                  })}
                </Track>
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-full bg-gradient-to-r from-violet-500 to-purple-600" /> ouverte
            maintenant
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-full bg-gradient-to-r from-pink-400 to-fuchsia-500" /> créneau
            d&apos;ouverture
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-0.5 bg-violet-950" /> maintenant
          </span>
        </div>
      </div>
    </section>
  );
}
