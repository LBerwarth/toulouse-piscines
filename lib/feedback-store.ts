import "server-only";
import { db, isConfigured } from "./supabase";
import { feedbackText, type Feedback } from "./feedback";

const MAIL_TO = process.env.FEEDBACK_EMAIL_TO ?? "lena.berw@gmail.com";
// Expéditeur partagé de Resend : n'exige aucun domaine vérifié et ne délivre
// qu'au titulaire du compte — c'est exactement l'usage ici.
const MAIL_FROM = process.env.FEEDBACK_EMAIL_FROM ?? "Piscines de Toulouse <onboarding@resend.dev>";

/** Enregistre le signalement (table `feedback`, cf. db/feedback.sql). */
export async function saveFeedback(fb: Feedback): Promise<void> {
  if (!isConfigured()) throw new Error("Supabase non configuré");
  const { error } = await db().from("feedback").insert({
    kind: fb.kind,
    pool_slug: fb.poolSlug,
    message: fb.message,
    email: fb.email,
  });
  if (error) throw error;
}

/**
 * Notifie l'auteure de l'application par e-mail via Resend. Sans
 * RESEND_API_KEY, on ne fait rien : le signalement reste consultable en base.
 */
export async function sendFeedbackEmail(fb: Feedback): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: MAIL_TO,
      ...(fb.email ? { reply_to: fb.email } : {}),
      subject: `Piscines de Toulouse — signalement (${fb.kind})`,
      text: feedbackText(fb),
    }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
  return true;
}
