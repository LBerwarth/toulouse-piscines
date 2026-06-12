import { POOLS, poolUrl, type Pool, type PoolEnv } from "./pools";
import { fetchPoolPage, type SectionLine } from "./scrape";
import { analyzeDay, type DayStatus } from "./parse-schedule";
import { getWeekInfo, type TodayInfo } from "./today";

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

async function getPoolStatus(pool: Pool, week: TodayInfo[]): Promise<PoolStatus> {
  const base = { slug: pool.slug, name: pool.name, url: poolUrl(pool), env: pool.env };
  try {
    const page = await fetchPoolPage(base.url);
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

export async function getStatusReport(): Promise<StatusReport> {
  const week = await getWeekInfo();
  const pools = await Promise.all(POOLS.map((p) => getPoolStatus(p, week)));
  return {
    updatedAt: new Date().toISOString(),
    days: week.map(({ dateKey, weekday }) => ({ dateKey, weekday })),
    pools,
  };
}
