import { parseFeedback } from "@/lib/feedback";
import { saveFeedback, sendFeedbackEmail } from "@/lib/feedback-store";

export const runtime = "nodejs";

/**
 * Garde-fou anti-abus, en mémoire seulement : le formulaire est ouvert à tous.
 * Rien n'est persisté (l'IP ne quitte pas l'instance, cf. la page
 * Confidentialité) et une instance recyclée repart de zéro — assez pour couper
 * un envoi en boucle, sans conserver de donnée personnelle.
 */
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const hits = [...(recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS), now];
  recent.set(ip, hits);
  if (recent.size > 500) {
    for (const [key, times] of recent) {
      if (times.every((t) => now - t >= WINDOW_MS)) recent.delete(key);
    }
  }
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "inconnu";
  if (tooMany(ip)) {
    return Response.json(
      { error: "Trop d'envois d'affilée — réessayez dans quelques minutes." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const parsed = parseFeedback(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  // Enregistrement et e-mail sont tentés tous les deux : le signalement n'est
  // perdu que si les deux échouent, et l'auteur en est alors averti.
  const stored = await saveFeedback(parsed.value).then(
    () => true,
    (err) => {
      console.error("feedback insert:", err instanceof Error ? err.message : err);
      return false;
    }
  );
  const mailed = await sendFeedbackEmail(parsed.value).catch((err) => {
    console.error("feedback email:", err instanceof Error ? err.message : err);
    return false;
  });

  if (!stored && !mailed) {
    return Response.json(
      { error: "Envoi impossible pour le moment — écrivez-nous par e-mail." },
      { status: 502 }
    );
  }
  return Response.json({ ok: true });
}
