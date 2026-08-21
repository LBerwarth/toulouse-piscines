import { poolUrl, type Pool, type PoolSource } from "../pools";
import { fetchPoolPage, type PageSections } from "../scrape";
import { fetchBalmaPage } from "./balma";
import { fetchBlagnacPage } from "./blagnac";
import { fetchColomiersPage } from "./colomiers";
import { fetchHersainPage } from "./hersain";
import { fetchLaunaguetPage } from "./launaguet";
import { fetchLeguevinPage } from "./leguevin";
import { fetchOasisPage } from "./oasis";
import { fetchPlaisancePage } from "./plaisance";

type SourceFetch = (url: string, opts?: { fresh?: boolean }) => Promise<PageSections>;

/**
 * Un adaptateur par site : aucune mairie ne partage la structure de page d'une
 * autre. Chacun renvoie le même PageSections, que analyzeDay consomme sans
 * savoir d'où il vient.
 */
const ADAPTERS: Record<PoolSource, SourceFetch> = {
  toulouse: fetchPoolPage,
  balma: fetchBalmaPage,
  blagnac: fetchBlagnacPage,
  colomiers: fetchColomiersPage,
  hersain: fetchHersainPage,
  launaguet: fetchLaunaguetPage,
  oasis: fetchOasisPage,
  plaisance: fetchPlaisancePage,
  leguevin: fetchLeguevinPage,
};

export function fetchSchedulePage(pool: Pool, opts?: { fresh?: boolean }): Promise<PageSections> {
  return ADAPTERS[pool.source ?? "toulouse"](poolUrl(pool), opts);
}
