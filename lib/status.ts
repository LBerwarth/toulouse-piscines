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
  /** Version du schéma des données mises en cache (cf. CACHE_SCHEMA_VERSION). */
  version: number;
  /** Les 7 prochains jours ([0] = aujourd'hui), index communs à PoolStatus.week */
  days: WeekDayRef[];
  pools: PoolStatus[];
}

async function getPoolStatus(pool: Pool, week: TodayInfo[], fresh: boolean): Promise<PoolStatus> {
  const base = { slug: pool.slug, name: pool.name, url: poolUrl(pool), env: pool.env };
  try {
    const page = await fetchPoolPage(base.url, { fresh });
    const days = week.map((d) => analyzeDay(page, d, pool));
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

/**
 * Version du schéma du rapport mis en cache. À incrémenter dès que la forme des
 * données change (ex. `announcements: string[]` → `{ title, detail }[]`). Un blob
 * d'une autre version est ignoré : on évite ainsi qu'un déploiement (ou une autre
 * instance partageant la ligne de cache) ne serve des données d'une forme obsolète.
 */
const CACHE_SCHEMA_VERSION = 2;

/**
 * Applique `fn` aux éléments en gardant au plus `limit` requêtes en vol, dans
 * l'ordre. Éviter de tirer les 12 pages d'un coup : un burst depuis une seule
 * IP datacenter (Vercel) déclenchait la protection anti-bot de la source. `fn`
 * (getPoolStatus) ne rejette jamais — inutile de gérer les erreurs ici.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Nombre de pages récupérées en parallèle (cf. mapWithConcurrency). */
const FETCH_CONCURRENCY = 4;

/** Scrape les 12 pages et construit le rapport. `fresh` force une requête réseau. */
async function buildReport(fresh: boolean): Promise<StatusReport> {
  const week = await getWeekInfo();
  const pools = await mapWithConcurrency(POOLS, FETCH_CONCURRENCY, (p) =>
    getPoolStatus(p, week, fresh)
  );
  return {
    updatedAt: new Date().toISOString(),
    version: CACHE_SCHEMA_VERSION,
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
 * Repousse le minuteur (`fetched_at`) sans toucher au rapport conservé : utilisé
 * quand un rescan échoue, pour garder le dernier bon rapport (son `updatedAt`,
 * donc son âge réel) tout en évitant de re-tenter la source en panne avant TTL.
 */
async function touchCacheTimer(fetchedAt: string): Promise<void> {
  const { error } = await db()
    .from("status_cache")
    .update({ fetched_at: fetchedAt })
    .eq("id", CACHE_ROW_ID);
  if (error) throw error;
}

/**
 * Nombre de piscines réellement exploitables : page récupérée, analysée ET
 * porteuse d'horaires (au moins une section). Le `sections.length > 0` est
 * essentiel : une page de maintenance renvoyée en HTTP 200 (cf. fetchPoolPage)
 * ou un blob déjà mis en cache « à vide » par une ancienne version compte alors
 * pour zéro — on évite de servir ou d'écrire un rapport sans aucun horaire.
 */
function usablePoolCount(report: StatusReport): number {
  return report.pools.filter(
    (p) => p.ok && p.week !== null && p.raw !== null && p.raw.sections.length > 0
  ).length;
}

/**
 * Rapport d'état, mis en cache 30 min dans un magasin partagé (Supabase) avec
 * son horodatage réel de scraping. Ainsi le premier visiteur d'une fenêtre de
 * 30 min déclenche ET voit le rafraîchissement (pas de rechargement manuel), et
 * la date « Mis à jour » correspond toujours à l'âge réel des données affichées.
 *
 * Sans Supabase (dev local) ou s'il est injoignable : repli sur un scraping
 * direct mis en cache 30 min par le Data Cache de Next.
 *
 * Si un rescan échoue totalement (toutes les pages en erreur — typiquement une
 * maintenance de la source), on NE remplace PAS le cache : on continue de servir
 * le dernier bon rapport (avec son âge réel), et un bandeau côté client signale
 * que les horaires peuvent être périmés. L'application reste ainsi utilisable.
 */
export async function getStatusReport(): Promise<StatusReport> {
  if (!isConfigured()) return buildReport(false);

  // En développement, on n'utilise jamais le cache partagé : sinon on lit/écrit
  // la même ligne que la production, qui peut tourner sur un autre schéma — d'où
  // des données incohérentes des deux côtés. Le rendu local reflète le code local.
  if (process.env.NODE_ENV !== "production") return buildReport(false);

  try {
    const cached = await readCachedReport();
    // « Dernier bon rapport » = bon schéma ET réellement porteur d'horaires. Un
    // blob d'une autre version (ancien déploiement) ou vidé par le bug de la
    // page de maintenance servie en 200 (toutes les piscines sans section) ne
    // doit pas être servi comme référence : on l'ignore.
    const lastGood =
      cached &&
      cached.report.version === CACHE_SCHEMA_VERSION &&
      usablePoolCount(cached.report) > 0
        ? cached
        : null;
    if (lastGood && Date.now() - lastGood.fetchedAt < TTL_MS) {
      return lastGood.report;
    }

    const fresh = await buildReport(true);
    if (usablePoolCount(fresh) > 0) {
      try {
        await writeCachedReport(fresh);
      } catch {
        // Écriture du cache best-effort : on renvoie quand même les données fraîches.
      }
      return fresh;
    }

    // Échec total du rescan (source indisponible). On journalise le détail par
    // piscine — visible dans les logs Vercel — pour distinguer un vrai incident
    // source (HTTP 403, page de maintenance, timeout) d'un souci de parseur.
    console.error(
      "[status] rescan sans piscine exploitable, repli sur le dernier bon rapport :",
      fresh.pools
        .map((p) =>
          p.ok
            ? `${p.slug}: ok sections=${p.raw?.sections.length ?? 0}`
            : `${p.slug}: KO ${p.error}`
        )
        .join(" | ")
    );

    // On conserve le dernier bon rapport et on repousse la prochaine tentative
    // de TTL_MS (pour ne pas marteler une source en panne à chaque visite).
    if (lastGood) {
      try {
        await touchCacheTimer(new Date().toISOString());
      } catch {
        // best-effort
      }
      return lastGood.report;
    }

    // Aucun bon rapport en cache (premier démarrage) : on renvoie l'échec tel quel.
    return fresh;
  } catch {
    // Supabase injoignable / table absente : on sert des données fraîches sans cache partagé.
    return buildReport(false);
  }
}
