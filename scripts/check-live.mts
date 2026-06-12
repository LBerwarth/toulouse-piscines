/**
 * Vérification manuelle contre les pages réelles de la mairie :
 * affiche, pour chaque piscine, le statut analysé des 7 prochains jours.
 *
 *   npx tsx scripts/check-live.mts            → résumé semaine
 *   npx tsx scripts/check-live.mts bellevue   → détail d'une piscine (sections brutes)
 */
import { POOLS, poolUrl } from "../lib/pools";
import { fetchPoolPage } from "../lib/scrape";
import { analyzeDay } from "../lib/parse-schedule";
import { getWeekInfo } from "../lib/today";

const DAY_SHORT = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

const filter = process.argv[2]?.toLowerCase();

const week = await getWeekInfo();
console.log(
  `Semaine analysée : ${week.map((d) => `${DAY_SHORT[d.weekday]} ${d.dateKey % 100}`).join(", ")}`
);
console.log(`Vacances scolaires : ${week.map((d) => (d.isSchoolHoliday ? "oui" : d.isSchoolHoliday === false ? "non" : "?")).join(", ")}\n`);

for (const pool of POOLS) {
  if (filter && !pool.slug.includes(filter)) continue;
  try {
    const page = await fetchPoolPage(poolUrl(pool));
    console.log(`━━━ ${pool.name} ━━━`);
    if (filter) {
      console.log(`  intro: ${page.intro.slice(0, 300)}`);
      for (const n of page.notices) console.log(`  notice: ${n.slice(0, 200)}`);
      for (const s of page.sections) {
        console.log(`  section « ${s.title} »`);
        for (const l of s.lines) console.log(`    [${l.kind}] ${l.text.slice(0, 120)}`);
      }
    }
    for (const day of week) {
      const st = analyzeDay(page, day);
      const slots = st.slotsToday.map((s) => `${s.start}-${s.end}`).join(" ");
      const flags = [
        st.confidence === "low" ? "CONFIANCE FAIBLE" : "",
        st.alerts.length ? `alertes:${st.alerts.length}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const basins =
        st.basins.length > 1
          ? " | " +
            st.basins
              .map(
                (b) =>
                  `${b.label ?? "principal"}: ${b.slots.map((s) => `${s.start}-${s.end}`).join(" ") || "fermé"}`
              )
              .join(" ; ")
          : "";
      console.log(
        `  ${DAY_SHORT[day.weekday]} ${String(day.dateKey % 100).padStart(2)} : ` +
          (st.openToday ? `OUVERT ${slots}` : `fermé (${st.closureReason?.slice(0, 80)})`) +
          basins +
          (flags ? `  [${flags}]` : "")
      );
      if (st.alerts.length && day === week[0]) {
        for (const a of st.alerts) console.log(`    ⚠ ${a.slice(0, 150)}`);
      }
    }
  } catch (err) {
    console.log(`━━━ ${pool.name} ━━━\n  ERREUR : ${err instanceof Error ? err.message : err}`);
  }
  console.log();
}
