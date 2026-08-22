import { readCachedReport, usablePoolCount } from "@/lib/status";
import { tarifVerifications } from "@/lib/tarifs";
import { fetchHtml } from "@/lib/sources/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Le 1er du mois, le contrôle des tarifs ajoute jusqu'à 7 fetchs de 15 s max.
export const maxDuration = 150;

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
      // Âge réel des données servies (report.updatedAt), et non le minuteur
      // `fetched_at` : ce dernier est avancé à chaque tentative de rescan (cron
      // ou page) même en échec, et masquerait une source figée.
      const ageMin = Math.round((Date.now() - new Date(cached.report.updatedAt).getTime()) / 60_000);
      if (ageMin * 60_000 > MAX_CACHE_AGE_MS) {
        problems.push(`données figées depuis ${ageMin} min — cron et rescan de secours muets ?`);
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

      // Clé Gemini configurée mais des actus restent sans lecture LLM (quota
      // journalier épuisé, API en panne, réponses invalides) : le repli regex
      // masque le problème — seul ce contrôle le rend visible.
      const news = cached.report.news;
      if (process.env.GEMINI_API_KEY && news && news.read < news.seen) {
        problems.push(
          `lectures LLM incomplètes : ${news.read}/${news.seen} actus lues (quota ou API ?)`
        );
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

  // Tarifs relevés (lib/tarifs.ts) : une fois par mois, vérifier que les
  // montants figurent toujours sur leur page source — les mairies révisent
  // leurs prix une fois l'an, inutile (et impoli) de les interroger chaque
  // jour. Une divergence alerte, elle ne met jamais à jour en silence.
  if (toulouseDayOfMonth() === 1) {
    for (const { source, expect } of tarifVerifications()) {
      try {
        const html = await fetchHtml(source, { fresh: true });
        const missing = expect.filter((needle) => !html.includes(needle));
        if (missing.length > 0) {
          problems.push(`tarifs à revérifier sur ${source} : « ${missing.join(" », « ")} » introuvable(s)`);
        }
      } catch (err) {
        problems.push(
          `tarifs invérifiables (${source}) : ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (problems.length > 0) {
    console.error("[sanity]", problems.join(" | "));
    return Response.json({ ok: false, problems }, { status: 500 });
  }
  return Response.json({ ok: true, checkedAt: new Date().toISOString() });
}

/** Jour du mois à Toulouse (le serveur peut tourner en UTC). */
function toulouseDayOfMonth(): number {
  return Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric" }).format(new Date())
  );
}
