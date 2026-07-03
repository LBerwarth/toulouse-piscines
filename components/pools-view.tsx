"use client";

import { useState, useSyncExternalStore } from "react";
import type { DayStatus, PoolStatus, TimeSlot, WeekDayRef } from "@/lib/status";
import { classifyBasinEnv, isAnnexBasin, type Environment } from "@/lib/environment";
import { POOLS, poolHasBasinLength, type BasinLength, type Pool } from "@/lib/pools";
import { WeekTimeline } from "./week-timeline";
import { PoolList } from "./pool-list";
import { usePoolNotifications } from "./use-pool-notifications";

// Filtres combinables : emplacement × longueur de bassin × ouverture × favoris.
type EnvFilter = "all" | Environment;
type LengthFilter = "all" | BasinLength;
type OpenFilter = "all" | "now" | "today";

const ENV_OPTIONS: { value: EnvFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "indoor", label: "Intérieur" },
  { value: "outdoor", label: "Plein air" },
];

const LENGTH_OPTIONS: { value: LengthFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: 25, label: "25 m" },
  { value: 50, label: "50 m" },
];

const OPEN_OPTIONS: { value: OpenFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "now", label: "Maintenant" },
  { value: "today", label: "Aujourd'hui" },
];

function nowInToulouse(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Réévalue l'heure chaque minute pour tenir à jour le filtre « Maintenant ». */
function subscribeToMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

// Les longueurs de bassins ne sont pas dans PoolStatus (données scrapées) :
// on les lit dans les métadonnées statiques, par slug.
const POOL_BY_SLUG = new Map(POOLS.map((p) => [p.slug, p]));

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

/**
 * Ne conserve que les bassins du jour correspondant aux filtres :
 * — emplacement (piscines mixtes) : classement du bassin d'après son libellé ;
 * — longueur : écarte les bassins annexes (petit bassin, pataugeoire…) et,
 *   quand le libellé permet de situer le bassin, ceux dont l'emplacement n'a
 *   pas de bassin de la longueur demandée (ex. Toulouse Lautrec en « 25 m » :
 *   le nordique de 50 m disparaît, seul l'intérieur de 25 m — fermé — reste).
 */
function filterDay(day: DayStatus, pool: Pool, env: EnvFilter, length: LengthFilter): DayStatus {
  const basins = day.basins.filter((b) => {
    const basinEnv =
      classifyBasinEnv(b.label) ?? (pool.env !== "mixed" ? (pool.env as Environment) : null);
    if (env !== "all" && pool.env === "mixed" && basinEnv !== env) return false;
    if (length !== "all") {
      if (isAnnexBasin(b.label)) return false;
      // Libellé non situable sur une piscine mixte : on garde (ne pas avaler
      // un bassin qu'on ne sait pas classer).
      if (basinEnv !== null && !poolHasBasinLength(pool, length, basinEnv)) return false;
    }
    return true;
  });
  const slots = mergeSlots(basins.flatMap((b) => b.slots));
  return {
    ...day,
    basins,
    slotsToday: slots,
    openToday: slots.length > 0,
    closureReason: slots.length > 0 ? null : basins.find((b) => b.note)?.note ?? day.closureReason,
  };
}

function filterPools(
  pools: PoolStatus[],
  env: EnvFilter,
  length: LengthFilter,
  open: OpenFilter,
  now: string | null,
  favorites: string[] | null
): PoolStatus[] {
  // « Favoris » : filtre par piscine (indépendant des autres critères), on
  // garde la piscine entière. Se cumule avec les filtres emplacement/longueur.
  let selected = favorites ? pools.filter((p) => favorites.includes(p.slug)) : pools;

  // Longueur : au niveau de la piscine — a-t-elle un bassin de 25/50 m, le cas
  // échéant dans l'emplacement demandé ? (ex. « 50 m » + « Plein air » ne garde
  // que les piscines dont un bassin EXTÉRIEUR fait 50 m.)
  if (length !== "all") {
    selected = selected.filter((p) => {
      const meta = POOL_BY_SLUG.get(p.slug);
      return meta !== undefined && poolHasBasinLength(meta, length, env === "all" ? undefined : env);
    });
  }

  // Emplacement : les piscines pures se filtrent en bloc, les mixtes restent
  // et sont élaguées bassin par bassin ci-dessous.
  if (env !== "all") {
    selected = selected.filter((p) => p.env === env || p.env === "mixed");
  }

  // Élagage des bassins du jour (piscines mixtes sous filtre emplacement, et
  // toutes les piscines sous filtre longueur — les annexes disparaissent).
  const needsDayFilter = (pool: PoolStatus) =>
    (env !== "all" && pool.env === "mixed") || length !== "all";
  const pruned = selected.map((pool) => {
    const meta = POOL_BY_SLUG.get(pool.slug);
    if (!meta || !pool.week || !needsDayFilter(pool)) return pool;
    return { ...pool, week: pool.week.map((d) => filterDay(d, meta, env, length)) };
  });

  // Ouverture : APRÈS l'élagage des bassins, pour que « Plein air + Maintenant »
  // exige un bassin extérieur ouvert en ce moment (et pas n'importe lequel).
  // Les piscines dont la page n'a pas pu être lue (week null) sont écartées :
  // on ne peut pas garantir qu'elles sont ouvertes.
  if (open === "all") return pruned;
  return pruned.filter((pool) => {
    const today = pool.week?.[0];
    if (!today || !today.openToday || today.slotsToday.length === 0) return false;
    // Avant hydratation (now inconnu), « Maintenant » se comporte comme
    // « Aujourd'hui » — le filtre étant activé au clic, le cas est théorique.
    if (open === "now" && now !== null) {
      return today.slotsToday.some((s) => now >= s.start && now < s.end);
    }
    return true;
  });
}

/** Pastille de filtre (bouton bascule), style commun aux trois groupes. */
function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1 text-xs transition-colors ${
        selected
          ? "bg-gradient-to-r from-pink-500 to-fuchsia-600 font-semibold text-white shadow-sm"
          : "bg-white/70 font-medium text-fuchsia-900 hover:bg-fuchsia-100"
      }`}
    >
      {children}
    </button>
  );
}

export function PoolsView({ pools, days }: { pools: PoolStatus[]; days: WeekDayRef[] }) {
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("all");
  const [openFilter, setOpenFilter] = useState<OpenFilter>("all");
  // Même mécanique que PoolList : null au rendu serveur et à l'hydratation,
  // puis heure de Toulouse rafraîchie chaque minute.
  const now = useSyncExternalStore<string | null>(subscribeToMinute, nowInToulouse, () => null);
  const [favOnly, setFavOnly] = useState(false);
  const notif = usePoolNotifications();
  const hasFavorites = notif.favorites.length > 0;

  // « Favoris » actif mais plus aucun ★ (favoris retirés) : le filtre devient
  // inactif. Dérivé au rendu (pas de setState en effet) — la pastille Favoris
  // disparaît alors, donc pas de filtre vide sans échappatoire.
  const effectiveFavOnly = favOnly && hasFavorites;
  const filtered = filterPools(
    pools,
    envFilter,
    lengthFilter,
    openFilter,
    now,
    effectiveFavOnly ? notif.favorites : null
  );

  // Explication des notifications, formulée pour rendre le modèle explicite :
  // par défaut on est alerté de TOUTES les piscines ; ajouter des ★ restreint
  // aux favorites, tout enlever revient à toutes les suivre.
  const favCount = notif.favorites.length;
  const notifHint = notif.denied
    ? "Notifications bloquées par le navigateur — autorisez-les dans les réglages pour être alerté·e."
    : notif.subscribed
      ? favCount > 0
        ? `🔔 Alertes activées pour vos ${favCount} piscine${favCount > 1 ? "s" : ""} favorite${favCount > 1 ? "s" : ""} ★. Retirez toutes les étoiles pour être de nouveau alerté·e de toutes les piscines.`
        : "🔔 Alertes activées pour toutes les piscines. Touchez l'étoile ★ d'une ou plusieurs piscines pour ne recevoir que leurs alertes."
      : "Activez les alertes pour être prévenu·e des fermetures et changements exceptionnels (horaires prolongés, canicule…). Sans ★, vous serez alerté·e de toutes les piscines ; ajoutez des ★ pour ne suivre que les vôtres.";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        {/* Un groupe de filtres par ligne — tous se cumulent. */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70">
              Type
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ENV_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  selected={envFilter === opt.value}
                  onClick={() => setEnvFilter(opt.value)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70">
              Longueur
            </span>
            <div className="flex flex-wrap gap-1.5">
              {LENGTH_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  selected={lengthFilter === opt.value}
                  onClick={() => setLengthFilter(opt.value)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70">
              Ouvertes
            </span>
            <div className="flex flex-wrap gap-1.5">
              {OPEN_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  selected={openFilter === opt.value}
                  onClick={() => setOpenFilter(opt.value)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          {hasFavorites && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70">
                Suivies
              </span>
              <Chip selected={effectiveFavOnly} onClick={() => setFavOnly(!effectiveFavOnly)}>
                ★ Favoris
              </Chip>
            </div>
          )}
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
        <p className="-mt-2 mb-4 text-xs text-slate-500">{notifHint}</p>
      )}

      {filtered.length === 0 ? (
        <p className="mb-6 rounded-3xl bg-white p-6 text-center text-sm text-slate-500 shadow-lg shadow-pink-100/60">
          Aucune piscine ne correspond à ces filtres.
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
