import { POOLS } from "./pools";

/**
 * Ancre du formulaire, partagée par le lien de pied de page (composant serveur)
 * et le formulaire lui-même : déclarée ici et non dans le composant client, dont
 * les exports non-composants ne sont que des références côté serveur.
 */
export const FEEDBACK_ANCHOR = "signaler";

/** Nature du signalement, proposée en pastilles dans le formulaire. */
export const FEEDBACK_KINDS = [
  { value: "horaires", label: "Horaires incorrects" },
  { value: "fermeture", label: "Fermeture non signalée" },
  { value: "suggestion", label: "Suggestion" },
  { value: "autre", label: "Autre" },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["value"];

export const MESSAGE_MAX = 1500;
export const EMAIL_MAX = 200;

export interface Feedback {
  kind: FeedbackKind;
  /** null = signalement général, sans piscine précise */
  poolSlug: string | null;
  message: string;
  /** Facultatif, uniquement pour pouvoir répondre */
  email: string | null;
}

function kindLabel(kind: FeedbackKind): string {
  return FEEDBACK_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

function isKind(value: unknown): value is FeedbackKind {
  return FEEDBACK_KINDS.some((k) => k.value === value);
}

/**
 * Valide la charge utile du formulaire. Une nature ou une piscine inconnue est
 * ramenée au cas général (sans intérêt à refuser l'envoi) ; un message vide ou
 * un e-mail mal formé est refusé, avec le texte à afficher à l'auteur — perdre
 * son adresse en silence lui ferait attendre une réponse impossible.
 */
export function parseFeedback(
  body: unknown
): { ok: true; value: Feedback } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Requête invalide." };
  }
  const { kind, poolSlug, message, email } = body as Record<string, unknown>;

  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return { ok: false, error: "Merci d'écrire un message." };
  if (text.length > MESSAGE_MAX) {
    return { ok: false, error: `Message trop long (${MESSAGE_MAX} caractères maximum).` };
  }

  const mail = typeof email === "string" ? email.trim() : "";
  if (mail && (mail.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail))) {
    return { ok: false, error: "Adresse e-mail invalide." };
  }

  return {
    ok: true,
    value: {
      kind: isKind(kind) ? kind : "autre",
      poolSlug: POOLS.some((p) => p.slug === poolSlug) ? (poolSlug as string) : null,
      message: text,
      email: mail || null,
    },
  };
}

/** Corps de l'e-mail de notification (et du repli mailto côté navigateur). */
export function feedbackText(fb: Feedback): string {
  const pool = POOLS.find((p) => p.slug === fb.poolSlug);
  return [
    `Type : ${kindLabel(fb.kind)}`,
    `Piscine : ${pool ? pool.name : "toutes / non précisée"}`,
    `Réponse : ${fb.email ?? "pas d'adresse laissée"}`,
    "",
    fb.message,
  ].join("\n");
}
