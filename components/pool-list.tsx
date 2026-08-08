"use client";

import { useSyncExternalStore } from "react";
import type { PoolStatus } from "@/lib/status";
import type { SectionLine } from "@/lib/scrape";
import { formatPhone, phoneHref, poolDirectionsUrl } from "@/lib/pools";

/** Ligne d'horaires : « Lundi : … », « Du lundi au jeudi : … », « Samedi et dimanche … » */
const DAY_LINE_RE = /^(?:du|le)?\s*(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i;

/**
 * Étiquette de sous-grille (« Horaires habituels en période scolaire »,
 * « Horaires exceptionnels vague de chaleur… ») insérée en texte simple au
 * milieu d'une section : on la traite comme un sous-titre pour séparer
 * lisiblement les deux grilles d'une même section.
 */
function isScheduleSubLabel(line: SectionLine): boolean {
  if (line.kind !== "text") return false;
  const t = line.text.toLowerCase();
  return (
    /^horaires?\b/.test(t) &&
    !/\d{1,2}\s*h/.test(t) && // pas d'heures → étiquette, pas une règle
    /habituel|exceptionnel|scolaire|vacances|été|hiver|chaleur|canicule|période|estival/.test(t)
  );
}

/**
 * Réordonne l'affichage d'une section : dans chaque sous-bloc (délimité par
 * les sous-titres et les étiquettes de sous-grille), les lignes par jour
 * restent groupées et les notes en prose (« Le petit bassin est fermé… »)
 * passent après — la mairie les insère parfois au milieu de la grille.
 */
function orderLines(lines: SectionLine[]): SectionLine[] {
  const out: SectionLine[] = [];
  let dayLines: SectionLine[] = [];
  let notes: SectionLine[] = [];
  const flush = () => {
    // Sans ligne par jour, l'ordre d'origine est conservé
    out.push(...(dayLines.length > 0 ? [...dayLines, ...notes] : notes));
    dayLines = [];
    notes = [];
  };
  for (const line of lines) {
    if (line.kind === "heading" || isScheduleSubLabel(line)) {
      flush();
      // Une étiquette en texte simple est promue en sous-titre pour rester
      // à sa place et distinguer les deux grilles.
      out.push(line.kind === "heading" ? line : { kind: "heading", text: line.text });
    } else if (DAY_LINE_RE.test(line.text)) {
      dayLines.push(line);
    } else {
      notes.push(line);
    }
  }
  flush();
  return out;
}

type LiveState =
  | { kind: "open"; until: string }
  | { kind: "later"; at: string }
  | { kind: "done" }
  | { kind: "closed"; reason: string | null }
  | { kind: "unknown" };

function nowInToulouse(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/** Réévalue l'heure chaque minute pour rafraîchir les badges « ouverte/fermée ». */
function subscribeToMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

function liveState(pool: PoolStatus, now: string | null): LiveState {
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

const ORDER: Record<LiveState["kind"], number> = {
  open: 0,
  later: 1,
  done: 2,
  closed: 3,
  unknown: 4,
};

function Pill({
  bg,
  text,
  dot,
  children,
}: {
  bg: string;
  text: string;
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full ${bg} px-2.5 py-1 text-xs font-semibold ${text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function Badge({ state }: { state: LiveState }) {
  switch (state.kind) {
    case "open":
      return (
        <Pill
          bg="bg-violet-100 dark:bg-violet-400/15"
          text="text-violet-700 dark:text-violet-200"
          dot="bg-violet-600 dark:bg-violet-300"
        >
          Ouverte · jusqu&apos;à {state.until}
        </Pill>
      );
    case "later":
      return (
        <Pill
          bg="bg-amber-100 dark:bg-amber-400/15"
          text="text-amber-700 dark:text-amber-200"
          dot="bg-amber-500 dark:bg-amber-300"
        >
          Ouvre à {state.at}
        </Pill>
      );
    case "done":
      return (
        <Pill
          bg="bg-slate-100 dark:bg-white/10"
          text="text-slate-500 dark:text-slate-300"
          dot="bg-slate-400 dark:bg-slate-400"
        >
          Terminé pour aujourd&apos;hui
        </Pill>
      );
    case "closed":
      return (
        <Pill
          bg="bg-red-100 dark:bg-red-400/15"
          text="text-red-700 dark:text-red-200"
          dot="bg-red-500 dark:bg-red-300"
        >
          Fermée aujourd&apos;hui
        </Pill>
      );
    default:
      return (
        <Pill
          bg="bg-slate-100 dark:bg-white/10"
          text="text-slate-400 dark:text-slate-400"
          dot="bg-slate-300 dark:bg-slate-500"
        >
          Indisponible
        </Pill>
      );
  }
}

function PoolCard({
  pool,
  now,
  isFavorite,
  onToggleFavorite,
}: {
  pool: PoolStatus;
  now: string | null;
  isFavorite?: boolean;
  onToggleFavorite?: (slug: string) => void;
}) {
  const state = liveState(pool, now);
  const day = pool.week?.[0];
  // Bandeaux « En bref » à afficher : on retire celui déjà montré comme raison
  // de fermeture (sinon doublon avec le message « Fermée »).
  const banners = day?.announcements?.filter((a) => a.title !== day.closureReason) ?? [];

  return (
    <li className="rounded-2xl bg-card p-4 shadow-md shadow-pink-100/50 dark:shadow-none dark:ring-1 dark:ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1.5">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(pool.slug)}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
              title={
                isFavorite
                  ? "Favorite — en tête de liste"
                  : "Ajouter aux favoris : en tête de liste, et ciblage possible des alertes"
              }
              className={`-ml-0.5 shrink-0 text-lg leading-none transition-colors ${
                isFavorite
                  ? "text-amber-400"
                  : "text-slate-300 hover:text-amber-300 dark:text-slate-500 dark:hover:text-amber-300"
              }`}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          )}
          <a
            href={pool.url}
            target="_blank"
            rel="noreferrer"
            title="Page officielle de la mairie — ouvre un nouvel onglet"
            aria-label={`${pool.name} — page officielle de la mairie (nouvel onglet)`}
            className="group/name text-base font-semibold text-slate-900 underline decoration-slate-300 decoration-1 underline-offset-4 hover:text-fuchsia-700 hover:decoration-fuchsia-400 dark:text-slate-50 dark:decoration-slate-500 dark:hover:text-fuchsia-300 dark:hover:decoration-fuchsia-400"
          >
            {pool.name}
            {/* Marqueur « lien externe » : sans lui le nom passe pour un titre,
                et l'indice au survol n'existe pas sur mobile. Même gabarit que
                le bouton d'itinéraire, en neutre — celui-ci reste l'action mise
                en avant. */}
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 align-[-0.35em] text-slate-500 transition-colors group-hover/name:bg-fuchsia-100 group-hover/name:text-fuchsia-700 dark:bg-white/10 dark:text-slate-300 dark:group-hover/name:bg-fuchsia-400/25 dark:group-hover/name:text-fuchsia-100">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
              </svg>
            </span>
          </a>
          <a
            href={poolDirectionsUrl(pool)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Itinéraire vers la piscine ${pool.name} (Google Maps)`}
            title="Itinéraire — ouvre Google Maps"
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white shadow-sm transition-opacity hover:opacity-90 dark:from-pink-600 dark:to-fuchsia-700"
          >
            {/* Flèche « Itinéraire » de Google Maps (icône Material near_me) */}
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
              <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
            </svg>
          </a>
          {pool.phone && (
            <a
              href={phoneHref(pool.phone)}
              aria-label={`Appeler la piscine ${pool.name} au ${formatPhone(pool.phone)}`}
              title={`Appeler l'accueil — ${formatPhone(pool.phone)}`}
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              {/* Combiné « Appeler » (icône Material call) */}
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.24.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            </a>
          )}
        </div>
        <Badge state={state} />
      </div>

      {!pool.ok && (
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
          Impossible de récupérer la page officielle ({pool.error}).
        </p>
      )}

      {day && day.basins.length > 1 ? (
        <div className="mt-2 space-y-1">
          {day.basins.map((basin) => (
            <div
              key={basin.label ?? "bassin"}
              className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1"
            >
              {basin.label && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{basin.label} :</span>
              )}
              {basin.slots.length > 0 ? (
                basin.slots.map((slot) => (
                  <span
                    key={`${slot.start}-${slot.end}`}
                    className="rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-fuchsia-900 dark:bg-fuchsia-400/15 dark:text-fuchsia-100"
                  >
                    {slot.start}–{slot.end}
                  </span>
                ))
              ) : (
                <span
                  className="text-xs italic text-slate-400 dark:text-slate-300"
                  title={basin.note ?? undefined}
                >
                  fermé
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        day &&
        day.slotsToday.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {day.slotsToday.map((slot) => (
              <span
                key={`${slot.start}-${slot.end}`}
                className="rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-fuchsia-900 dark:bg-fuchsia-400/15 dark:text-fuchsia-100"
              >
                {slot.start}–{slot.end}
              </span>
            ))}
          </div>
        )
      )}

      {state.kind === "closed" && state.reason && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{state.reason}</p>
      )}

      {banners.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {banners.map((a) => (
            <li key={a.title} className="text-xs text-sky-800 dark:text-sky-200">
              <span className="font-medium">📢 {a.title}</span>
              {a.detail && (
                <span className="mt-0.5 block whitespace-pre-line text-sky-700/90 dark:text-sky-300/90">
                  {a.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {day && day.alerts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {day.alerts.map((alert) => (
            <li key={alert} className="text-xs text-amber-800 dark:text-amber-200">
              ⚠️ {alert}
            </li>
          ))}
        </ul>
      )}

      {day && day.confidence === "low" && (
        <p className="mt-2 text-xs italic text-slate-400 dark:text-slate-300">
          Information incertaine — vérifiez la page officielle.
        </p>
      )}

      {pool.raw && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
            Voir les infos publiées
          </summary>
          <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            {day?.extendedTo && (
              <p className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-sky-800 dark:bg-sky-400/10 dark:text-sky-200">
                ⏱️ Aujourd&apos;hui, la fermeture est exceptionnellement repoussée à{" "}
                {day.extendedTo} (voir l&apos;actu 📢 ci-dessus). La grille ci-dessous reprend les
                horaires habituels publiés par la mairie.
              </p>
            )}
            {pool.raw.intro && <p>{pool.raw.intro}</p>}
            {pool.raw.notices.map((n) => (
              <p key={n} className="text-amber-800 dark:text-amber-200">
                {n}
              </p>
            ))}
            {pool.raw.sections.map((s) => (
              <details
                key={s.title}
                className="rounded-xl border border-fuchsia-100/60 bg-fuchsia-50/40 px-2.5 py-1.5 dark:border-fuchsia-300/15 dark:bg-fuchsia-400/5"
              >
                <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">
                  {s.title}
                </summary>
                <div className="mt-1.5 space-y-1.5">
                  {orderLines(s.lines).map((line, i) =>
                    line.kind === "heading" ? (
                      <p key={i} className="pt-1 font-semibold text-slate-700 dark:text-slate-200">
                        {line.text}
                      </p>
                    ) : (
                      <p key={i}>{line.text}</p>
                    )
                  )}
                </div>
              </details>
            ))}
          </div>
        </details>
      )}
    </li>
  );
}

export function PoolList({
  pools,
  isFavorite,
  onToggleFavorite,
}: {
  pools: PoolStatus[];
  isFavorite?: (slug: string) => boolean;
  onToggleFavorite?: (slug: string) => void;
}) {
  // L'heure courante reste « null » au rendu serveur (mis en cache 30 min) et à
  // l'hydratation, puis bascule sur l'heure réelle de Toulouse côté client —
  // useSyncExternalStore garantit l'accord serveur/client sans setState en effet.
  const now = useSyncExternalStore<string | null>(subscribeToMinute, nowInToulouse, () => null);

  // Les piscines suivies (★) remontent en tête ; à l'intérieur de chaque
  // groupe, l'ordre habituel s'applique (ouvertes d'abord, puis alphabétique).
  const sorted = [...pools].sort((a, b) => {
    const favA = isFavorite?.(a.slug) ? 0 : 1;
    const favB = isFavorite?.(b.slug) ? 0 : 1;
    if (favA !== favB) return favA - favB;
    const diff = ORDER[liveState(a, now).kind] - ORDER[liveState(b, now).kind];
    return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
  });

  return (
    <ul className="space-y-3">
      {sorted.map((pool) => (
        <PoolCard
          key={pool.slug}
          pool={pool}
          now={now}
          isFavorite={onToggleFavorite ? isFavorite?.(pool.slug) : undefined}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </ul>
  );
}
