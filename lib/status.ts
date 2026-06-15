import { POOLS, poolUrl, type Pool, type PoolEnv } from "./pools";
import { fetchPoolPage, type SectionLine } from "./scrape";
import { analyzeDay, type DayStatus } from "./parse-schedule";
import { getWeekInfo, type TodayInfo } from "./today";
import { db, isConfigured } from "./supabase";

export type { BasinSchedule, DayStatus, TimeSlot } from "./parse-schedule";
export type { PoolEnv } from "./pools";

/** Infos publiées, allégées pour le client (sans les corps de texte bruts) */
export interface PoolInfo {
  intro: string;
  notices: string[];
  sections: { title: string; lines: SectionLine[] }[];
}

export interface PoolStatus {
  slug: string;
  name: string;
  url: string;
  /** Type de bassins : intérieur, extérieur, ou mixte */
  env: PoolEnv;
  /** false si la page n'a pas pu être récupérée */
  ok: boolean;
  error: string | null;
  /** Statut des 7 prochains jours, aligné sur StatusReport.days ([0] = aujourd'hui) ;
   *  null uniquement si la page n'a pas pu être récupérée */
  week: DayStatus[] | null;
  /** Sections publiées, pour vérification dans l'interface */
  raw: PoolInfo | null;
}

export interface WeekDayRef {
  dateKey: number;
  /** 0 = lundi … 6 = dimanche */
  weekday: number;
}

export interface StatusReport {
  updatedAt: string;
  /** Les 7 prochains jours ([0] = aujourd'hui), index communs à PoolStatus.week */
  days: WeekDayRef[];
  pools: PoolStatus[];
}

async function getPoolStatus(pool: Pool, week: TodayInfo[], fresh: boolean): Promise<PoolStatus> {
  const base = { slug: pool.slug, name: pool.name, url: poolUrl(pool), env: pool.env };
  try {
    const page = await fetchPoolPage(base.url, { fresh });
    const days = week.map((d) => analyzeDay(page, d));
    // Les corps de texte bruts (section.body) ne servent qu'à l'analyse
    // côté serveur : on ne les envoie pas au navigateur.
    const raw: PoolInfo = {
      intro: page.intro,
      notices: page.notices,
      sections: page.sections.map(({ title, lines }) => ({ title, lines })),
    };
    return { ...base, ok: true, error: null, week: days, raw };
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      week: null,
      raw: null,
    };
  }
}

/** Délai au-delà duquel les données sont rescannées (aligné sur la publication
 *  des fermetures par la mairie). */
const TTL_MS = 1800_000; // 30 min

/** Scrape les 12 pages et construit le rapport. `fresh` force une requête réseau. */
async function buildReport(fresh: boolean): Promise<StatusReport> {
  const week = await getWeekInfo();
  const pools = await Promise.all(POOLS.map((p) => getPoolStatus(p, week, fresh)));
  return {
    updatedAt: new Date().toISOString(),
    days: week.map(({ dateKey, weekday }) => ({ dateKey, weekday })),
    pools,
  };
}

// Ligne unique partagée par toutes les instances : sert de cache + de minuteur.
const CACHE_ROW_ID = 1;

async function readCachedReport(): Promise<{ report: StatusReport; fetchedAt: number } | null> {
  const { data, error } = await db()
    .from("status_cache")
    .select("report,fetched_at")
    .eq("id", CACHE_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    report: data.report as StatusReport,
    fetchedAt: new Date(data.fetched_at as string).getTime(),
  };
}

async function writeCachedReport(report: StatusReport): Promise<void> {
  const { error } = await db()
    .from("status_cache")
    .upsert(
      { id: CACHE_ROW_ID, report, fetched_at: report.updatedAt },
      { onConflict: "id" }
    );
  if (error) throw error;
}

/**
 * Rapport d'état, mis en cache 30 min dans un magasin partagé (Supabase) avec
 * son horodatage réel de scraping. Ainsi le premier visiteur d'une fenêtre de
 * 30 min déclenche ET voit le rafraîchissement (pas de rechargement manuel), et
 * la date « Mis à jour » correspond toujours à l'âge réel des données affichées.
 *
 * Sans Supabase (dev local) ou s'il est injoignable : repli sur un scraping
 * direct mis en cache 30 min par le Data Cache de Next.
 */
export async function getStatusReport(): Promise<StatusReport> {
  if (!isConfigured()) return buildReport(false);

  try {
    const cached = await readCachedReport();
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return cached.report;
    }
    const fresh = await buildReport(true);
    try {
      await writeCachedReport(fresh);
    } catch {
      // Écriture du cache best-effort : on renvoie quand même les données fraîches.
    }
    return fresh;
  } catch {
    // Supabase injoignable / table absente : on sert des données fraîches sans cache partagé.
    return buildReport(false);
  }
}
