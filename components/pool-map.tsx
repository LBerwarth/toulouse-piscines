"use client";

import type { PoolStatus } from "@/lib/status";
import { liveState } from "@/lib/live-state";
import {
  BRIENNE_PATH,
  CANAL_PATH,
  GARONNE_PATH,
  LATERAL_PATH,
  METRO_LINES,
  MONUMENTS,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  groupSites,
  type MapSite,
  type MonumentIcon,
} from "@/lib/map-geometry";

/** Étoile à cinq branches centrée sur (0,0), rayon 1 — repère des piscines ★. */
const STAR = Array.from({ length: 10 }, (_, i) => {
  const angle = (Math.PI / 5) * i - Math.PI / 2;
  const r = i % 2 === 0 ? 1 : 0.42;
  return `${(Math.cos(angle) * r).toFixed(3)},${(Math.sin(angle) * r).toFixed(3)}`;
}).join(" ");

/**
 * Nom court pour les repères qui regroupent plusieurs bassins : « Alfred
 * Nakache été » et « Alfred Nakache hiver » se réduisent tous deux à
 * « Nakache », qui ne s'affiche alors qu'une fois.
 */
function shortName(name: string): string {
  const base = name.replace(/\s+(été|hiver)$/i, "").trim();
  return base.split(/\s+/).pop() ?? base;
}

const METRO_STYLE = {
  A: {
    line: "stroke-red-500/40 dark:stroke-red-400/30",
    stop: "fill-red-500/60 dark:fill-red-400/50",
    badge: "fill-red-500 dark:fill-red-400",
    letter: "fill-white dark:fill-red-950",
  },
  B: {
    line: "stroke-yellow-500/50 dark:stroke-yellow-300/30",
    stop: "fill-yellow-500/70 dark:fill-yellow-300/50",
    badge: "fill-yellow-400 dark:fill-yellow-300",
    letter: "fill-yellow-950",
  },
} as const;

function MonumentGlyph({ icon }: { icon: MonumentIcon }) {
  switch (icon) {
    case "capitole":
      return (
        <>
          <path d="M -16 9 V -5 H 16 V 9 Z" />
          <path d="M -16 -5 L 0 -13 L 16 -5" />
          <path d="M -8 9 V -5 M 0 9 V -5 M 8 9 V -5" />
        </>
      );
    case "basilique":
      return (
        <>
          <path d="M -6 12 V -2 L 0 -12 L 6 -2 V 12" />
          <path d="M 0 -12 V -19 M -3 -16 H 3" />
        </>
      );
    case "pont":
      return (
        <>
          <path d="M -20 -5 H 20" />
          <path d="M -18 8 A 6 6 0 0 1 -6 8 A 6 6 0 0 1 6 8 A 6 6 0 0 1 18 8" />
        </>
      );
    case "stade":
      return (
        <>
          <ellipse rx="15" ry="9" />
          <ellipse rx="7" ry="3.5" />
        </>
      );
    case "zenith":
      return <path d="M -15 7 H 15 M -11 7 A 11 11 0 0 1 11 7" />;
  }
}

function siteLabel(site: MapSite, bySlug: Map<string, PoolStatus>): string {
  const names = site.slugs.map((s) => bySlug.get(s)?.name ?? s);
  if (names.length === 1) return names[0];
  // Nakache été, Nakache hiver et Castex : un seul complexe, mais les deux noms
  // restent affichés — c'est ainsi que les Toulousains les cherchent.
  return [...new Set(names.map(shortName))].join(" · ");
}

export function PoolMap({
  pools,
  now,
  isFavorite,
}: {
  pools: PoolStatus[];
  now: string | null;
  isFavorite?: (slug: string) => boolean;
}) {
  const bySlug = new Map(pools.map((p) => [p.slug, p]));
  const sites = groupSites(pools.map((p) => p.slug));
  if (sites.length === 0) return null;

  const openCount = pools.filter((p) => liveState(p, now).kind === "open").length;

  return (
    <section className="mb-6 rounded-3xl bg-card p-4 shadow-lg shadow-pink-100/60 dark:shadow-none dark:ring-1 dark:ring-white/10 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
        Où sont les piscines
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {now === null
          ? `${sites.length} sites, le métro, la Garonne et le canal du Midi pour se repérer.`
          : `${openCount} piscine${openCount > 1 ? "s" : ""} ouverte${openCount > 1 ? "s" : ""} en ce moment.`}
      </p>

      {/* Le plan est plus haut que large (les piscines s'étirent du nord au sud) :
          on borne sa largeur pour qu'il ne dévore pas l'écran sur grand écran. */}
      <div className="relative mx-auto mt-3 w-full max-w-[340px]">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="block w-full rounded-2xl bg-sky-50/70 dark:bg-violet-950/40"
          role="img"
          aria-label={`Carte schématique de Toulouse situant les ${sites.length} sites de piscines municipales, avec les lignes A et B du métro et quelques monuments repères.`}
        >
          <defs>
            <linearGradient id="carte-ouverte" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#c026d3" />
            </linearGradient>
          </defs>

          <path
            d={GARONNE_PATH}
            fill="none"
            strokeWidth="26"
            strokeLinecap="round"
            className="stroke-sky-200/80 dark:stroke-sky-400/25"
          />
          <path
            d={CANAL_PATH}
            fill="none"
            strokeWidth="11"
            strokeLinecap="round"
            className="stroke-sky-200/70 dark:stroke-sky-400/20"
          />
          <path
            d={BRIENNE_PATH}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="stroke-sky-200/70 dark:stroke-sky-400/20"
          />
          <path
            d={LATERAL_PATH}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="stroke-sky-200/70 dark:stroke-sky-400/20"
          />

          {METRO_LINES.map((line) => (
            <path
              key={line.id}
              d={line.path}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              className={METRO_STYLE[line.id].line}
            />
          ))}

          {MONUMENTS.map((m) => (
            <g
              key={m.nom}
              fill="none"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-slate-400/90 dark:stroke-slate-400/70"
              transform={`translate(${m.point.x} ${m.point.y})${m.rotate ? ` rotate(${m.rotate})` : ""}`}
            >
              <MonumentGlyph icon={m.icon} />
            </g>
          ))}

          {METRO_LINES.map((line) => (
            <g key={line.id}>
              {line.stops.map((stop) => (
                <circle key={stop.nom} cx={stop.x} cy={stop.y} r="6" className={METRO_STYLE[line.id].stop}>
                  <title>{`${stop.nom} (ligne ${line.id})`}</title>
                </circle>
              ))}
              {line.badges.map((badge, i) => (
                <g key={i} transform={`translate(${badge.x} ${badge.y})`}>
                  <circle r="15" className={METRO_STYLE[line.id].badge} />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="19"
                    fontWeight="700"
                    className={METRO_STYLE[line.id].letter}
                  >
                    {line.id}
                  </text>
                </g>
              ))}
            </g>
          ))}

          {sites.map((site) => {
            const open = site.slugs.some((s) => {
              const pool = bySlug.get(s);
              return pool ? liveState(pool, now).kind === "open" : false;
            });
            const starred = site.slugs.some((s) => isFavorite?.(s));
            const fill = open ? "url(#carte-ouverte)" : undefined;
            const muted = open
              ? ""
              : "fill-slate-300 dark:fill-slate-600";
            return (
              <g key={site.slugs[0]}>
                {starred ? (
                  <polygon
                    points={STAR}
                    fill={fill}
                    className={muted}
                    transform={`translate(${site.point.x} ${site.point.y}) scale(19)`}
                  />
                ) : (
                  <circle cx={site.point.x} cy={site.point.y} r="13" fill={fill} className={muted} />
                )}
              </g>
            );
          })}
        </svg>

        {/* Étiquettes en HTML plutôt qu'en <text> : elles gardent la taille de
            police du reste de l'application quelle que soit la largeur du SVG. */}
        {MONUMENTS.map((m) => {
          const left = (m.point.x / VIEW_WIDTH) * 100;
          const top = (m.point.y / VIEW_HEIGHT) * 100;
          const right = m.labelSide === "left";
          return (
            <span
              key={m.nom}
              className={`pointer-events-none absolute -translate-y-1/2 whitespace-nowrap text-[9px] italic leading-none text-slate-400 dark:text-slate-500 ${
                right ? "-translate-x-full" : ""
              }`}
              style={{
                left: `calc(${left}% + ${right ? "-0.9rem" : "0.9rem"})`,
                top: `${top}%`,
              }}
            >
              {m.nom}
            </span>
          );
        })}
        {sites.map((site) => {
          const left = (site.point.x / VIEW_WIDTH) * 100;
          const top = (site.point.y / VIEW_HEIGHT) * 100;
          const right = site.labelSide === "left";
          return (
            <a
              key={site.slugs[0]}
              href={`#carte-${site.slugs[0]}`}
              title={`Aller à ${siteLabel(site, bySlug)}`}
              className={`absolute -translate-y-1/2 whitespace-nowrap rounded px-1 text-[11px] font-medium leading-tight text-slate-700 underline-offset-2 hover:text-fuchsia-700 hover:underline dark:text-slate-200 dark:hover:text-fuchsia-300 sm:text-xs ${
                right ? "-translate-x-full" : ""
              }`}
              style={{
                left: `calc(${left}% + ${right ? "-1.1rem" : "1.1rem"})`,
                top: `${top}%`,
              }}
            >
              {siteLabel(site, bySlug)}
            </a>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Plan simplifié, sans fond cartographique : aucune donnée n&apos;est envoyée à un service
        tiers. Métro d&apos;après les données ouvertes Tisséo / Toulouse Métropole, embarquées
        dans l&apos;application. Touchez un nom pour ouvrir sa fiche.
      </p>
    </section>
  );
}
