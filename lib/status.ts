import { after } from "next/server";
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

/**
 * Cron actif ~7 h–19 h à Toulouse (cf. .github/workflows/check-closures.yml) ;
 * pause le soir et la nuit. En journée, au-delà de cet âge le cache est jugé en retard
 * (passage du cron sauté — ses `schedule` sont « best effort ») et la page
 * relance elle-même un rescan de secours. Choisi SOUS le seuil du bandeau
 * « périmé » (StaleBanner, 45 min) pour qu'un simple retard du cron ne
 * l'affiche jamais : il ne paraît que si le rescan échoue vraiment (source
 * réellement en panne).
 */
const CACHE_STALE_DAYTIME_MS = 35 * 60_000; // 35 min

/**
 * La nuit (cron en pause, ~19 h–7 h, soit 12 h), la mairie ne publie pas : on
 * sert le cache du soir tel quel jusqu'à cet âge sans rescanner. Au-delà, le
 * cron est vraisemblablement mort et la page reprend le rescan.
 */
const CACHE_ABANDONED_NIGHT_MS = 46_800_000; // 13 h

/** Heure locale à Toulouse (0–23). Le serveur peut tourner en UTC. */
function toulouseHour(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return h === 24 ? 0 : h; // certains moteurs rendent minuit « 24 »
}

/** Le cron de jour tourne-t-il à cette heure locale ? (fenêtre large été/hiver.) */
function cronActive(hour: number): boolean {
  return hour >= 7 && hour < 19;
}

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

export async function readCachedReport(): Promise<
  { report: StatusReport; fetchedAt: number; fetchedAtRaw: string } | null
> {
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
    fetchedAtRaw: data.fetched_at as string,
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
 * Réserve le rescan de secours déclenché par la page : avance `fetched_at` à
 * maintenant SI la valeur observée n'a pas changé (compare-and-swap côté
 * Postgres). Une seule requête gagne le verrou, les visiteurs simultanés
 * servent le cache tel quel — indispensable à fort trafic : un cache périmé ne
 * doit pas déclencher un rescan par visite (rafale d'IP datacenter → anti-bot
 * de la source). Avancer `fetched_at` sert aussi de backoff : la tentative
 * suivante n'aura lieu qu'après le même délai, que ce rescan réussisse ou non.
 */
async function claimRefresh(observedFetchedAt: string): Promise<boolean> {
  const { data, error } = await db()
    .from("status_cache")
    .update({ fetched_at: new Date().toISOString() })
    .eq("id", CACHE_ROW_ID)
    .eq("fetched_at", observedFetchedAt)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Rescan de secours exécuté après l'envoi de la page (next/after), une fois le
 * verrou obtenu (claimRefresh). Réécrit le cache si le scan porte des horaires ;
 * sinon on garde le dernier bon rapport — son `updatedAt` vieillit, ce qui finit
 * par afficher le bandeau « périmé » si la source reste vraiment en panne.
 */
async function backgroundRefresh(): Promise<void> {
  try {
    const fresh = await buildReport(true);
    if (usablePoolCount(fresh) > 0) {
      await writeCachedReport(fresh);
      return;
    }
    console.error(
      "[status] rescan page sans piscine exploitable :",
      fresh.pools
        .map((p) =>
          p.ok
            ? `${p.slug}: ok sections=${p.raw?.sections.length ?? 0}`
            : `${p.slug}: KO ${p.error}`
        )
        .join(" | ")
    );
  } catch (err) {
    console.error("[status] rescan page échoué :", err instanceof Error ? err.message : err);
  }
}

/**
 * Nombre de piscines réellement exploitables : page récupérée, analysée ET
 * porteuse d'horaires (au moins une section). Le `sections.length > 0` est
 * essentiel : une page de maintenance renvoyée en HTTP 200 (cf. fetchPoolPage)
 * ou un blob déjà mis en cache « à vide » par une ancienne version compte alors
 * pour zéro — on évite de servir ou d'écrire un rapport sans aucun horaire.
 */
export function usablePoolCount(report: StatusReport): number {
  return report.pools.filter(
    (p) => p.ok && p.week !== null && p.raw !== null && p.raw.sections.length > 0
  ).length;
}

/**
 * Rescan complet + écriture du cache partagé — appelé par le cron (qui scrape
 * de toute façon les pages en direct). Le rapport n'est écrit que s'il porte
 * réellement des horaires : un rescan vide (maintenance de la source) n'écrase
 * jamais le dernier bon cache. Renvoie le rapport frais tel quel — l'appelant
 * (cron) n'y trouvera alors que des piscines en erreur, donc rien à notifier.
 */
export async function refreshStatusReport(): Promise<StatusReport> {
  const fresh = await buildReport(true);
  if (isConfigured() && usablePoolCount(fresh) > 0) {
    try {
      await writeCachedReport(fresh);
    } catch {
      // Écriture best-effort : le prochain passage du cron retentera.
    }
  }
  return fresh;
}

/**
 * Rapport d'état servi aux visiteurs : lecture du cache partagé (Supabase),
 * alimenté par le cron ~15 min en journée (refreshStatusReport). La page ne
 * scrape pas elle-même tant que le cache est frais — un seul scraper à cadence
 * connue face à la mairie, TTFB constant même sous forte affluence.
 *
 * Auto-guérison : les `schedule` GitHub Actions sont « best effort » (la cadence
 * 15 min tombe souvent à 1–3 h). Si le cache dépasse l'âge toléré en journée
 * (cron en retard), la page se resynchronise SANS bloquer la réponse : un seul
 * visiteur obtient le verrou (claimRefresh), rescanne après l'envoi de la page
 * (next/after) et réécrit le cache ; tous servent le dernier bon rapport en
 * attendant. Le seuil de jour est sous celui du bandeau « périmé » : un simple
 * retard du cron ne l'affiche jamais.
 *
 * Le soir et la nuit (cron en pause dès ~19 h), on sert le cache du soir tel
 * quel jusqu'à 13 h d'âge sans rescanner : la mairie ne publie pas la nuit.
 *
 * Sans Supabase (dev local) ou s'il est injoignable : repli sur un scraping
 * direct mis en cache 30 min par le Data Cache de Next.
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
    // blob d'une autre version (ancien déploiement) ou vidé par une page de
    // maintenance servie en 200 (toutes les piscines sans section) ne doit pas
    // servir de référence : on l'ignore.
    const lastGood =
      cached &&
      cached.report.version === CACHE_SCHEMA_VERSION &&
      usablePoolCount(cached.report) > 0
        ? cached
        : null;

    if (lastGood) {
      const maxAgeMs = cronActive(toulouseHour())
        ? CACHE_STALE_DAYTIME_MS
        : CACHE_ABANDONED_NIGHT_MS;
      if (Date.now() - lastGood.fetchedAt < maxAgeMs) return lastGood.report;

      // Périmé (cron en retard) : rescan de secours en tâche de fond, verrouillé
      // pour qu'un seul visiteur le déclenche. On sert le dernier bon rapport.
      try {
        if (await claimRefresh(lastGood.fetchedAtRaw)) after(backgroundRefresh);
      } catch {
        // Verrou best-effort : sans lui (Supabase KO) on sert quand même le cache.
      }
      return lastGood.report;
    }

    // Aucun bon rapport en cache (premier démarrage / cache corrompu) : rien à
    // servir, on scrape en direct.
    const fresh = await buildReport(true);
    if (usablePoolCount(fresh) > 0) {
      try {
        await writeCachedReport(fresh);
      } catch {
        // Écriture best-effort : on renvoie quand même les données fraîches.
      }
    }
    return fresh;
  } catch {
    // Supabase injoignable / table absente : on sert des données fraîches sans cache partagé.
    return buildReport(false);
  }
}
