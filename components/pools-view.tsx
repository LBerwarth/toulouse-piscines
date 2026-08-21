"use client";

import { useState, useSyncExternalStore } from "react";
import type { DayStatus, PoolStatus, TimeSlot, WeekDayRef } from "@/lib/status";
import { classifyBasinEnv, isAnnexBasin, type Environment } from "@/lib/environment";
import { POOLS, poolHasBasinLength, type Pool } from "@/lib/pools";
import {
  persistFilters,
  ZONES_KEPT,
  type EnvFilter,
  type FilterPreset,
  type LengthFilter,
  type OpenFilter,
  type ZoneFilter,
} from "@/lib/filters";
import { CollapsibleSection } from "./collapsible-section";
import { WeekTimeline } from "./week-timeline";
import { PoolList } from "./pool-list";
import { PoolMap } from "./pool-map";
import { usePoolNotifications } from "./use-pool-notifications";

// Une pastille de secteur n'a de sens que si elle élargit vraiment la liste :
// chaque cran n'ajoute qu'un secteur, et sans piscine dans ce secteur la
// pastille donnerait le même résultat que la précédente.
const ZONE_OPTIONS: { value: ZoneFilter; label: string }[] = (
  [
    { value: "toulouse", label: "Toulouse", adds: "toulouse" },
    { value: "metropole", label: "Métropole", adds: "metropole" },
    { value: "all", label: "+ alentours", adds: "alentours" },
  ] as const
)
  .filter((opt) => POOLS.some((p) => p.zone === opt.adds))
  .map(({ value, label }) => ({ value, label }));

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
  zone: ZoneFilter,
  env: EnvFilter,
  length: LengthFilter,
  open: OpenFilter,
  now: string | null,
  favorites: string[] | null
): PoolStatus[] {
  // « Favoris » : mes piscines, où qu'elles soient — le secteur ne s'y
  // applique pas (une favorite à Colomiers ne disparaît pas en vue Toulouse).
  // Sinon, le secteur borne le périmètre géographique. Les filtres
  // emplacement/longueur, eux, se cumulent dans les deux cas.
  const kept = ZONES_KEPT[zone];
  let selected = favorites
    ? pools.filter((p) => favorites.includes(p.slug))
    : pools.filter((p) => {
        const meta = POOL_BY_SLUG.get(p.slug);
        return meta !== undefined && kept.includes(meta.zone);
      });

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
          ? "bg-gradient-to-r from-pink-500 to-fuchsia-600 font-semibold text-white shadow-sm dark:from-pink-600 dark:to-fuchsia-700"
          : "bg-white/70 font-medium text-fuchsia-900 hover:bg-fuchsia-100 dark:bg-white/10 dark:text-fuchsia-100 dark:hover:bg-fuchsia-400/20"
      }`}
    >
      {children}
    </button>
  );
}

export function PoolsView({
  pools,
  days,
  preset,
}: {
  pools: PoolStatus[];
  days: WeekDayRef[];
  preset: FilterPreset;
}) {
  // Même mécanique que PoolList : null au rendu serveur et à l'hydratation,
  // puis heure de Toulouse rafraîchie chaque minute.
  const now = useSyncExternalStore<string | null>(subscribeToMinute, nowInToulouse, () => null);

  // Un choix explicite de l'utilisateur (même « Toutes ») prime sur le préréglage.
  const [zoneChoice, setZoneFilter] = useState<ZoneFilter | null>(null);
  const [envChoice, setEnvFilter] = useState<EnvFilter | null>(null);
  const [lengthChoice, setLengthFilter] = useState<LengthFilter | null>(null);
  const [openChoice, setOpenFilter] = useState<OpenFilter | null>(null);
  const [favChoice, setFavOnly] = useState<boolean | null>(null);

  const requestedZone = zoneChoice ?? preset.zone;
  // Cookie ou raccourci pointant un cran sans piscine : on prend le plus large
  // disponible, sinon aucune pastille ne paraîtrait active.
  const zoneFilter = ZONE_OPTIONS.some((o) => o.value === requestedZone)
    ? requestedZone
    : (ZONE_OPTIONS[ZONE_OPTIONS.length - 1]?.value ?? "toulouse");
  const envFilter = envChoice ?? preset.env;
  const lengthFilter = lengthChoice ?? preset.length;
  const openFilter = openChoice ?? preset.open;
  const favOnly = favChoice ?? preset.fav;

  const notif = usePoolNotifications();
  const hasFavorites = notif.favorites.length > 0;

  // « Favoris » actif mais plus aucun ★ (favoris retirés) : le filtre devient
  // inactif. Dérivé au rendu (pas de setState en effet) — la pastille Favoris
  // disparaît alors, donc pas de filtre vide sans échappatoire.
  const effectiveFavOnly = favOnly && hasFavorites;

  // Mémorise le choix dans le cookie — mais seulement sur clic : un raccourci
  // du lanceur ne doit pas écraser la préférence habituelle de l'utilisateur.
  const persist = (change: Partial<FilterPreset>) =>
    persistFilters({
      zone: zoneFilter,
      env: envFilter,
      length: lengthFilter,
      open: openFilter,
      fav: effectiveFavOnly,
      ...change,
    });

  /**
   * Clic sur un filtre (type / longueur / ouvertes) : si plus AUCUNE favorite
   * ne passerait le nouveau réglage, « ★ Favoris » se désactive au lieu de
   * laisser une liste vide — chercher un 25 m quand toutes ses ★ font 50 m,
   * c'est chercher une autre piscine que les siennes.
   */
  const clickFilter = (change: { env?: EnvFilter; length?: LengthFilter; open?: OpenFilter }) => {
    const nextEnv = change.env ?? envFilter;
    const nextLength = change.length ?? lengthFilter;
    const nextOpen = change.open ?? openFilter;
    let fav = effectiveFavOnly;
    if (
      fav &&
      filterPools(pools, zoneFilter, nextEnv, nextLength, nextOpen, now, notif.favorites)
        .length === 0
    ) {
      fav = false;
      setFavOnly(false);
    }
    if (change.env !== undefined) setEnvFilter(change.env);
    if (change.length !== undefined) setLengthFilter(change.length);
    if (change.open !== undefined) setOpenFilter(change.open);
    persist({ ...change, fav });
  };

  /**
   * Bascule « ★ Favoris ». À l'activation, les autres filtres reviennent à
   * « Toutes » : ★ veut dire « mes piscines, toutes mes piscines » — un 25 m
   * resté actif en masquerait une partie sans que rien ne le signale.
   */
  const toggleFavOnly = () => {
    const next = !effectiveFavOnly;
    setFavOnly(next);
    if (next) {
      setZoneFilter("metropole");
      setEnvFilter("all");
      setLengthFilter("all");
      setOpenFilter("all");
      persistFilters({ zone: "metropole", env: "all", length: "all", open: "all", fav: true });
      return;
    }
    persist({ fav: false });
  };
  const filtered = filterPools(
    pools,
    zoneFilter,
    envFilter,
    lengthFilter,
    openFilter,
    now,
    effectiveFavOnly ? notif.favorites : null
  );

  // La portée (toutes / seulement ★) est un choix explicite (dialogue) — la ★
  // seule ne change plus les alertes en silence.
  const favCount = notif.favorites.length;
  const notifHint = notif.denied
    ? "Notifications bloquées par le navigateur — autorisez-les dans les réglages pour être alerté·e."
    : notif.subscribed
      ? notif.scope === "starred" && favCount > 0
        ? `🔔 Alertes activées pour vos ${favCount} piscine${favCount > 1 ? "s" : ""} favorite${favCount > 1 ? "s" : ""} ★.`
        : "🔔 Alertes activées pour toutes les piscines."
      : "Activez les alertes pour être prévenu·e des fermetures et changements exceptionnels (horaires prolongés, canicule…) — pour toutes les piscines ou seulement vos ★, au choix.";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        {/* Un groupe de filtres par ligne — tous se cumulent. */}
        <div className="flex flex-col gap-2">
          {/* Sous filtre ★, le secteur ne s'applique plus : la ligne disparaît
              plutôt que d'afficher des pastilles sans effet. */}
          {!effectiveFavOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70 dark:text-violet-200/85">
              Secteur
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ZONE_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  selected={zoneFilter === opt.value}
                  onClick={() => {
                    setZoneFilter(opt.value);
                    persist({ zone: opt.value });
                  }}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70 dark:text-violet-200/85">
              Type
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ENV_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  selected={envFilter === opt.value}
                  onClick={() => clickFilter({ env: opt.value })}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70 dark:text-violet-200/85">
              Longueur
            </span>
            <div className="flex flex-wrap gap-1.5">
              {LENGTH_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  selected={lengthFilter === opt.value}
                  onClick={() => clickFilter({ length: opt.value })}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70 dark:text-violet-200/85">
              Ouvertes
            </span>
            <div className="flex flex-wrap gap-1.5">
              {OPEN_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  selected={openFilter === opt.value}
                  onClick={() => clickFilter({ open: opt.value })}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          {hasFavorites && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-violet-800/70 dark:text-violet-200/85">
                Suivies
              </span>
              <Chip selected={effectiveFavOnly} onClick={toggleFavOnly}>
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
                ? "bg-violet-600 text-white shadow-sm dark:bg-violet-500"
                : "bg-white/70 text-violet-800 hover:bg-fuchsia-100 dark:bg-white/10 dark:text-violet-100 dark:hover:bg-fuchsia-400/20"
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
        <p className="-mt-2 mb-4 text-xs text-slate-500 dark:text-slate-300">{notifHint}</p>
      )}

      {/* Choix explicite de la portée des alertes, posé une seule fois (dès
          qu'on est abonné·e ET qu'au moins une ★ existe). */}
      {notif.scopePrompt && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 dark:bg-violet-400/10">
          <span className="text-xs font-medium text-violet-900 dark:text-violet-100">
            🔔 Vos alertes : toutes les piscines, ou seulement vos ★ ?
          </span>
          <button
            type="button"
            onClick={() => notif.chooseScope("starred")}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-800 shadow-sm transition-colors hover:bg-fuchsia-100 dark:bg-white/10 dark:text-violet-100 dark:hover:bg-fuchsia-400/20"
          >
            Seulement mes ★
          </button>
          <button
            type="button"
            onClick={() => notif.chooseScope("all")}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-800 shadow-sm transition-colors hover:bg-fuchsia-100 dark:bg-white/10 dark:text-violet-100 dark:hover:bg-fuchsia-400/20"
          >
            Toutes les piscines
          </button>
        </div>
      )}

      {/* iOS dans le navigateur : au lieu de masquer les alertes (PushManager
          absent hors PWA installée), on explique la marche à suivre. */}
      {notif.needsInstall && (
        <p className="-mt-2 mb-4 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-400/10 dark:text-sky-200">
          📲 Sur iPhone et iPad, les alertes (fermetures imprévues, canicule…)
          nécessitent d&apos;installer l&apos;app : touchez{" "}
          <span className="font-medium">Partager</span> puis{" "}
          <span className="font-medium">« Sur l&apos;écran d&apos;accueil »</span>, ouvrez
          l&apos;app installée et activez les alertes ici.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="mb-6 rounded-3xl bg-card p-6 text-center text-sm text-slate-500 shadow-lg shadow-pink-100/60 dark:text-slate-400 dark:shadow-none dark:ring-1 dark:ring-white/10">
          Aucune piscine ne correspond à ces filtres.
        </p>
      ) : (
        <>
          <CollapsibleSection title="Horaires par jour" storageKey="bloc-horaires">
            <WeekTimeline pools={filtered} days={days} isFavorite={notif.isFavorite} />
          </CollapsibleSection>
          <CollapsibleSection title="Où sont les piscines" storageKey="bloc-carte">
            <PoolMap pools={filtered} now={now} isFavorite={notif.isFavorite} />
          </CollapsibleSection>
          {/* Les repères de la carte pointent sur #carte-<slug> : le bloc replié
              se rouvre alors de lui-même. */}
          <CollapsibleSection
            title={`Les piscines (${filtered.length})`}
            storageKey="bloc-piscines"
            variant="plain"
            hashPrefix="carte-"
          >
            <PoolList
              pools={filtered}
              isFavorite={notif.isFavorite}
              onToggleFavorite={notif.toggleFavorite}
            />
          </CollapsibleSection>
        </>
      )}
    </>
  );
}
