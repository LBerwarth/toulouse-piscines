import { POOLS, poolUrl, type Pool } from "./pools";
import { fetchPoolPage, type PageSections } from "./scrape";
import { analyzeDay, type DayStatus } from "./parse-schedule";
import { getTodayInfo, type TodayInfo } from "./today";

export type { BasinSchedule, DayStatus, TimeSlot } from "./parse-schedule";

export interface PoolStatus {
  slug: string;
  name: string;
  url: string;
  /** false si la page n'a pas pu être récupérée */
  ok: boolean;
  error: string | null;
  /** null uniquement si la page n'a pas pu être récupérée */
  day: DayStatus | null;
  /** Sections brutes, pour vérification dans l'interface */
  raw: PageSections | null;
}

export interface StatusReport {
  updatedAt: string;
  pools: PoolStatus[];
}

async function getPoolStatus(pool: Pool, today: TodayInfo): Promise<PoolStatus> {
  const base = { slug: pool.slug, name: pool.name, url: poolUrl(pool) };
  try {
    const page = await fetchPoolPage(base.url);
    return { ...base, ok: true, error: null, day: analyzeDay(page, today), raw: page };
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      day: null,
      raw: null,
    };
  }
}

export async function getStatusReport(): Promise<StatusReport> {
  const today = await getTodayInfo();
  const pools = await Promise.all(POOLS.map((p) => getPoolStatus(p, today)));
  return {
    updatedAt: new Date().toISOString(),
    pools,
  };
}
