"use client";

import type { PoolStatus } from "@/lib/status";
import { liveState } from "@/lib/live-state";
import { MAP_VIEWS, fitView, groupSites, type MapSite, type MonumentIcon } from "@/lib/map-geometry";
import type { ZoneFilter } from "@/lib/filters";

/** Étoile à cinq branches centrée sur (0,0), rayon 1 — repère des piscines ★. */
const STAR = Array.from({ length: 10 }, (_, i) => {
  const angle = (Math.PI / 5) * i - Math.PI / 2;
  const r = i % 2 === 0 ? 1 : 0.42;
  return `${(Math.cos(angle) * r).toFixed(3)},${(Math.sin(angle) * r).toFixed(3)}`;
}).join(" ");

/** Deux vaguelettes dans le rond du repère : on lit « piscine » d'un coup d'œil. */
const WAVES =
  "M -8 -2.5 c 2 -3.5 6 -3.5 8 0 c 2 3.5 6 3.5 8 0 M -8 5.5 c 2 -3.5 6 -3.5 8 0 c 2 3.5 6 3.5 8 0";

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
    line: "stroke-red-500/30 dark:stroke-red-400/25",
    stop: "fill-red-500/45 dark:fill-red-400/40",
    badge: "fill-red-500/80 dark:fill-red-400/80",
    letter: "fill-white dark:fill-red-950",
  },
  B: {
    line: "stroke-yellow-500/40 dark:stroke-yellow-300/25",
    stop: "fill-yellow-500/55 dark:fill-yellow-300/40",
    badge: "fill-yellow-400/85 dark:fill-yellow-300/85",
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
    case "avion":
      return (
        <path d="M 0 -14 V 14 M 0 -4 L -14 4 M 0 -4 L 14 4 M 0 11 L -6 15 M 0 11 L 6 15" />
      );
  }
}

function siteLabel(site: MapSite, bySlug: Map<string, PoolStatus>, zone: ZoneFilter): string {
  // Vues larges : les sites hors Toulouse s'étiquettent par leur commune —
  // « Blagnac » situe mieux que « Les Ramiers ».
  const commune = bySlug.get(site.slugs[0])?.commune;
  if (zone !== "toulouse" && commune && commune !== "Toulouse") return commune;
  const names = site.slugs.map((s) => bySlug.get(s)?.name ?? s);
  if (names.length === 1) return names[0];
  // Nakache été, Nakache hiver et Castex : un seul complexe, mais les deux noms
  // restent affichés — c'est ainsi que les Toulousains les cherchent.
  return [...new Set(names.map(shortName))].join(" · ");
}

/** Largeur d'affichage par vue : les vues larges sont plus étalées que hautes. */
const MAX_WIDTH: Record<ZoneFilter, string> = {
  toulouse: "max-w-[340px]",
  metropole: "max-w-[420px]",
  all: "max-w-[480px]",
};

export function PoolMap({
  pools,
  now,
  isFavorite,
}: {
  pools: PoolStatus[];
  now: string | null;
  isFavorite?: (slug: string) => boolean;
}) {
  // La vue suit ce qui est affiché, pas le filtre : des favoris éparpillés
  // appellent la vue large, un filtre ramené au centre-ville la vue détaillée.
  const zone: ZoneFilter = fitView(pools.map((p) => p.slug));
  const view = MAP_VIEWS[zone];
  const bySlug = new Map(pools.map((p) => [p.slug, p]));
  const sites = groupSites(pools.map((p) => p.slug), zone);
  if (sites.length === 0) return null;

  // Vues larges et carte pleine : les piscines de la ville se serrent au
  // centre, leurs étiquettes deviendraient illisibles — seuls les sites hors
  // Toulouse gardent la leur (leur commune), les repères de la ville restant
  // cliquables, nom en infobulle. Quand peu de sites sont affichés (favoris…),
  // tout le monde est étiqueté : il y a la place.
  const labelled = (site: MapSite): boolean =>
    zone === "toulouse" ||
    sites.length <= 6 ||
    site.slugs.some((s) => bySlug.get(s)?.commune !== "Toulouse");

  const openCount = pools.filter((p) => liveState(p, now).kind === "open").length;

  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {now === null
          ? `${sites.length} sites, le métro, la Garonne et le canal du Midi pour se repérer.`
          : `${openCount} piscine${openCount > 1 ? "s" : ""} ouverte${openCount > 1 ? "s" : ""} en ce moment.`}
      </p>

      {/* Largeur bornée pour que le plan ne dévore pas l'écran sur grand écran ;
          les vues larges, plus étalées, gagnent un peu de place. */}
      <div className={`relative mx-auto mt-3 w-full ${MAX_WIDTH[zone]}`}>
        <svg
          viewBox={`0 0 ${view.width} ${view.height}`}
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

          {view.rivers.map((river, i) => (
            <path
              key={i}
              d={river.d}
              fill="none"
              strokeWidth={river.width}
              strokeLinecap="round"
              className={
                i === 0
                  ? "stroke-sky-200/80 dark:stroke-sky-400/25"
                  : "stroke-sky-200/70 dark:stroke-sky-400/20"
              }
            />
          ))}

          {view.metro.map((line) => (
            <path
              key={line.id}
              d={line.path}
              fill="none"
              strokeWidth="7"
              strokeLinecap="round"
              className={METRO_STYLE[line.id].line}
            />
          ))}

          {view.monuments.map((m) => (
            <g
              key={m.nom}
              fill="none"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-slate-400/70 dark:stroke-slate-400/50"
              transform={`translate(${m.point.x} ${m.point.y})${m.rotate ? ` rotate(${m.rotate})` : ""}`}
            >
              <MonumentGlyph icon={m.icon} />
            </g>
          ))}

          {view.metro.map((line) => (
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
            // Liseré couleur du fond : détache le repère des lignes de métro
            // et des cours d'eau qu'il chevauche.
            const halo = "stroke-white dark:stroke-violet-950";
            return (
              <g key={site.slugs[0]}>
                <title>{siteLabel(site, bySlug, zone)}</title>
                {starred ? (
                  <polygon
                    points={STAR}
                    fill={fill}
                    strokeWidth={0.15}
                    className={`${muted} ${halo}`}
                    transform={`translate(${site.point.x} ${site.point.y}) scale(21)`}
                  />
                ) : (
                  <g transform={`translate(${site.point.x} ${site.point.y})`}>
                    <circle r="15" fill={fill} strokeWidth="3" className={`${muted} ${halo}`} />
                    <path
                      d={WAVES}
                      fill="none"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      className="stroke-white/90"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Étiquettes en HTML plutôt qu'en <text> : elles gardent la taille de
            police du reste de l'application quelle que soit la largeur du SVG. */}
        {view.monuments.map((m) => {
          const left = (m.point.x / view.width) * 100;
          const top = (m.point.y / view.height) * 100;
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
        {sites.filter(labelled).map((site) => {
          const left = (site.point.x / view.width) * 100;
          const top = (site.point.y / view.height) * 100;
          const right = site.labelSide === "left";
          return (
            <a
              key={site.slugs[0]}
              href={`#carte-${site.slugs[0]}`}
              title={`Aller à ${siteLabel(site, bySlug, zone)}`}
              className={`absolute -translate-y-1/2 whitespace-nowrap rounded bg-white/75 px-1 text-[11px] font-semibold leading-tight text-slate-800 underline-offset-2 hover:text-fuchsia-700 hover:underline dark:bg-violet-950/70 dark:text-slate-100 dark:hover:text-fuchsia-300 sm:text-xs ${
                right ? "-translate-x-full" : ""
              }`}
              style={{
                left: `calc(${left}% + ${right ? "-1.1rem" : "1.1rem"})`,
                top: `${top}%`,
              }}
            >
              {siteLabel(site, bySlug, zone)}
            </a>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Plan simplifié, sans fond cartographique : aucune donnée n&apos;est envoyée à un service
        tiers. Métro d&apos;après les données ouvertes Tisséo / Toulouse Métropole, embarquées
        dans l&apos;application. Touchez un nom pour ouvrir sa fiche.
      </p>
    </div>
  );
}
