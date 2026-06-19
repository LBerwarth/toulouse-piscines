"use client";

import { useSyncExternalStore } from "react";
import type { PoolStatus } from "@/lib/status";
import type { SectionLine } from "@/lib/scrape";
import { poolDirectionsUrl } from "@/lib/pools";

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
        <Pill bg="bg-violet-100" text="text-violet-700" dot="bg-violet-600">
          Ouverte · jusqu&apos;à {state.until}
        </Pill>
      );
    case "later":
      return (
        <Pill bg="bg-amber-100" text="text-amber-700" dot="bg-amber-500">
          Ouvre à {state.at}
        </Pill>
      );
    case "done":
      return (
        <Pill bg="bg-slate-100" text="text-slate-500" dot="bg-slate-400">
          Terminé pour aujourd&apos;hui
        </Pill>
      );
    case "closed":
      return (
        <Pill bg="bg-red-100" text="text-red-700" dot="bg-red-500">
          Fermée aujourd&apos;hui
        </Pill>
      );
    default:
      return (
        <Pill bg="bg-slate-100" text="text-slate-400" dot="bg-slate-300">
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
    <li className="rounded-2xl bg-white p-4 shadow-md shadow-pink-100/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-1.5">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(pool.slug)}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? "Retirer des favoris" : "Suivre cette piscine"}
              title={
                isFavorite
                  ? "Suivie — alertes activées pour cette piscine"
                  : "Suivre pour être alerté·e (fermetures, changements d'horaires…)"
              }
              className={`-ml-0.5 shrink-0 text-lg leading-none transition-colors ${
                isFavorite ? "text-amber-400" : "text-slate-300 hover:text-amber-300"
              }`}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          )}
          <a
            href={pool.url}
            target="_blank"
            rel="noreferrer"
            className="text-base font-semibold text-slate-900 hover:text-fuchsia-700"
          >
            {pool.name}
          </a>
          <a
            href={poolDirectionsUrl(pool)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Itinéraire vers la piscine ${pool.name} (Google Maps)`}
            title="Itinéraire — ouvre Google Maps"
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#1a73e8] text-white shadow-sm transition-colors hover:bg-[#1557b0]"
          >
            {/* Flèche « Itinéraire » de Google Maps (icône Material near_me) */}
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
              <path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z" />
            </svg>
          </a>
        </div>
        <Badge state={state} />
      </div>

      {!pool.ok && (
        <p className="mt-2 text-sm text-rose-700">
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
              {basin.label && <span className="text-xs text-slate-500">{basin.label} :</span>}
              {basin.slots.length > 0 ? (
                basin.slots.map((slot) => (
                  <span
                    key={`${slot.start}-${slot.end}`}
                    className="rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-fuchsia-900"
                  >
                    {slot.start}–{slot.end}
                  </span>
                ))
              ) : (
                <span className="text-xs italic text-slate-400" title={basin.note ?? undefined}>
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
                className="rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-fuchsia-900"
              >
                {slot.start}–{slot.end}
              </span>
            ))}
          </div>
        )
      )}

      {state.kind === "closed" && state.reason && (
        <p className="mt-2 text-sm text-slate-600">{state.reason}</p>
      )}

      {banners.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {banners.map((a) => (
            <li key={a.title} className="text-xs text-sky-800">
              <span className="font-medium">📢 {a.title}</span>
              {a.detail && (
                <span className="mt-0.5 block whitespace-pre-line text-sky-700/90">{a.detail}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {day && day.alerts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {day.alerts.map((alert) => (
            <li key={alert} className="text-xs text-amber-800">
              ⚠️ {alert}
            </li>
          ))}
        </ul>
      )}

      {day && day.confidence === "low" && (
        <p className="mt-2 text-xs italic text-slate-400">
          Information incertaine — vérifiez la page officielle.
        </p>
      )}

      {pool.raw && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-500">
            Voir les infos publiées
          </summary>
          <div className="mt-2 space-y-2 text-xs text-slate-600">
            {day?.extendedTo && (
              <p className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-sky-800">
                ⏱️ Aujourd&apos;hui, la fermeture est exceptionnellement repoussée à{" "}
                {day.extendedTo} (voir l&apos;actu 📢 ci-dessus). La grille ci-dessous reprend les
                horaires habituels publiés par la mairie.
              </p>
            )}
            {pool.raw.intro && <p>{pool.raw.intro}</p>}
            {pool.raw.notices.map((n) => (
              <p key={n} className="text-amber-800">
                {n}
              </p>
            ))}
            {pool.raw.sections.map((s) => (
              <details
                key={s.title}
                className="rounded-xl border border-fuchsia-100/60 bg-fuchsia-50/40 px-2.5 py-1.5"
              >
                <summary className="cursor-pointer font-medium text-slate-700">{s.title}</summary>
                <div className="mt-1.5 space-y-1.5">
                  {orderLines(s.lines).map((line, i) =>
                    line.kind === "heading" ? (
                      <p key={i} className="pt-1 font-semibold text-slate-700">
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
