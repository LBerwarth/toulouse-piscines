import { readCachedReport, usablePoolCount } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contrôle quotidien de santé des données, appelé par un workflow GitHub
 * Actions dédié : toute réponse non-200 fait échouer le job, et GitHub prévient
 * par e-mail. On ne vérifie pas la « vérité » des horaires (impossible sans
 * seconde source) mais des invariants qui trahissent une dérive silencieuse du
 * parseur ou une panne du cron — le mode de défaillance que personne ne voit.
 */

/** En dessous de ce nombre de piscines exploitables, quelque chose cloche. */
const MIN_USABLE = 8;
/** Au-delà de ce nombre de piscines « confiance faible » aujourd'hui, alerte. */
const MAX_LOW_CONFIDENCE = 4;
/** Cache plus vieux que ça = cron muet. Le contrôle passe en matinée, après
 *  plusieurs passages du cron de jour (15 min) : 2 h de marge suffisent. */
const MAX_CACHE_AGE_MS = 7200_000; // 2 h

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const problems: string[] = [];
  try {
    const cached = await readCachedReport();
    if (!cached) {
      problems.push("aucun rapport en cache");
    } else {
      const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60_000);
      if (ageMin * 60_000 > MAX_CACHE_AGE_MS) {
        problems.push(`cache muet depuis ${ageMin} min — cron en panne ?`);
      }

      const usable = usablePoolCount(cached.report);
      if (usable < MIN_USABLE) {
        problems.push(`${usable} piscine(s) exploitable(s) sur ${cached.report.pools.length}`);
      }

      const lowToday = cached.report.pools
        .filter((p) => p.week?.[0]?.confidence === "low")
        .map((p) => p.slug);
      if (lowToday.length > MAX_LOW_CONFIDENCE) {
        problems.push(`confiance faible aujourd'hui pour : ${lowToday.join(", ")}`);
      }

      // Fermée 7 jours sur 7 SANS raison publiée : grille probablement perdue
      // par le parseur (une vraie fermeture longue a toujours une raison).
      const silentAllClosed = cached.report.pools
        .filter(
          (p) =>
            p.ok &&
            p.week !== null &&
            p.week.every((d) => !d.openToday) &&
            p.week.every((d) => !d.closureReason)
        )
        .map((p) => p.slug);
      if (silentAllClosed.length > 0) {
        problems.push(`fermées 7 j sans raison publiée : ${silentAllClosed.join(", ")}`);
      }
    }
  } catch (err) {
    problems.push(`cache illisible : ${err instanceof Error ? err.message : String(err)}`);
  }

  if (problems.length > 0) {
    console.error("[sanity]", problems.join(" | "));
    return Response.json({ ok: false, problems }, { status: 500 });
  }
  return Response.json({ ok: true, checkedAt: new Date().toISOString() });
}
