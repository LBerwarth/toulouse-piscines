/* Aide au classement intérieur/extérieur : imprime, pour chaque piscine,
   l'intro + les encarts + les titres de sections + les libellés de bassins
   détectés, pour décider de la métadonnée env. */
import { POOLS, poolUrl } from "../lib/pools";
import { fetchPoolPage } from "../lib/scrape";
import { analyzeDay } from "../lib/parse-schedule";
import { getWeekInfo } from "../lib/today";

const week = await getWeekInfo();
const KW = /ext[ée]rieur|nordique|plein air|d[ée]couvert|couvert|int[ée]rieur|halle|plage|surveill|chauff/gi;

for (const pool of POOLS) {
  try {
    const page = await fetchPoolPage(poolUrl(pool));
    const labels = new Set<string>();
    for (const d of week) for (const b of analyzeDay(page, d).basins) if (b.label) labels.add(b.label);
    const text = `${page.intro} ${page.notices.join(" ")}`;
    const hits = [...new Set((text.match(KW) ?? []).map((s) => s.toLowerCase()))];
    console.log(`\n━━━ ${pool.name} (${pool.slug}) ━━━`);
    console.log(`  mots-clés intro/encarts : ${hits.join(", ") || "(aucun)"}`);
    console.log(`  bassins détectés : ${[...labels].join(" | ") || "(aucun libellé)"}`);
    console.log(`  intro : ${page.intro.slice(0, 240)}`);
  } catch (e) {
    console.log(`\n━━━ ${pool.name} ━━━ ERREUR ${e instanceof Error ? e.message : e}`);
  }
}
