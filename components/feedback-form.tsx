"use client";

import { useEffect, useState } from "react";
import { POOLS } from "@/lib/pools";
import {
  FEEDBACK_ANCHOR,
  FEEDBACK_KINDS,
  MESSAGE_MAX,
  feedbackText,
  type FeedbackKind,
} from "@/lib/feedback";

const CONTACT_EMAIL = "lena.berw@gmail.com";

// Fond OPAQUE et non translucide : Chrome peint la liste déroulante d'un
// <select> avec la couleur de fond du champ, et un fond transparent la rend
// blanche — donc illisible en thème sombre.
const INPUT_CLASS =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-fuchsia-400 focus:outline-none dark:border-white/15 dark:bg-[#241b32] dark:text-slate-100 dark:placeholder:text-slate-400";

export function FeedbackForm() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("horaires");
  const [poolSlug, setPoolSlug] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Lien de pied de page (« #signaler ») : le formulaire s'ouvre de lui-même,
  // au chargement comme au clic depuis la même page (hashchange).
  useEffect(() => {
    const openOnHash = () => {
      if (window.location.hash === `#${FEEDBACK_ANCHOR}`) setOpen(true);
    };
    openOnHash();
    window.addEventListener("hashchange", openOnHash);
    return () => window.removeEventListener("hashchange", openOnHash);
  }, []);

  const payload = {
    kind,
    poolSlug: poolSlug || null,
    message: message.trim(),
    email: email.trim() || null,
  };
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    "Piscines de Toulouse — signalement"
  )}&body=${encodeURIComponent(feedbackText(payload))}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending" || !payload.message) return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Envoi impossible pour le moment.");
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Envoi impossible pour le moment.");
    }
  }

  return (
    <section
      id={FEEDBACK_ANCHOR}
      className="mt-8 scroll-mt-4 overflow-hidden rounded-2xl bg-card shadow-md shadow-pink-100/50 dark:shadow-none dark:ring-1 dark:ring-white/10"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-violet-800 dark:text-violet-200">
          💬 Signaler une erreur ou donner votre avis
        </span>
        <span
          aria-hidden
          className={`shrink-0 text-xs text-violet-500 transition-transform dark:text-violet-300 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="border-t border-violet-100 px-4 py-4 dark:border-white/10">
          {status === "sent" ? (
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                ✓ Merci, votre message est bien arrivé.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                Les horaires sont relus automatiquement sur le site de la mairie&nbsp;: un
                signalement aide à corriger ce que le programme lit de travers.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setMessage("");
                }}
                className="mt-3 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-fuchsia-900 transition-colors hover:bg-fuchsia-100 dark:bg-white/10 dark:text-fuchsia-100 dark:hover:bg-fuchsia-400/20"
              >
                Envoyer un autre message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-300">
                Un horaire faux, une fermeture manquante, une idée&nbsp;? Dites-le, cela
                aide à corriger l&apos;application.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    aria-pressed={kind === k.value}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      kind === k.value
                        ? "bg-gradient-to-r from-pink-500 to-fuchsia-600 font-semibold text-white shadow-sm dark:from-pink-600 dark:to-fuchsia-700"
                        : "bg-white/70 font-medium text-fuchsia-900 hover:bg-fuchsia-100 dark:bg-white/10 dark:text-fuchsia-100 dark:hover:bg-fuchsia-400/20"
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <div>
                <label
                  htmlFor="feedback-pool"
                  className="block text-xs font-medium text-violet-800/70 dark:text-violet-200/85"
                >
                  Piscine concernée
                </label>
                <select
                  id="feedback-pool"
                  value={poolSlug}
                  onChange={(e) => setPoolSlug(e.target.value)}
                  className={`mt-1 dark:[&>option]:bg-[#241b32] dark:[&>option]:text-slate-100 ${INPUT_CLASS}`}
                >
                  <option value="">Aucune en particulier</option>
                  {POOLS.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="feedback-message"
                  className="block text-xs font-medium text-violet-800/70 dark:text-violet-200/85"
                >
                  Votre message
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={MESSAGE_MAX}
                  rows={4}
                  required
                  placeholder="Ex. : l'appli affiche Alex Jany fermée aujourd'hui, mais la fermeture annoncée est demain."
                  className={`mt-1 resize-y ${INPUT_CLASS}`}
                />
                {message.length > MESSAGE_MAX - 300 && (
                  <p className="mt-1 text-right text-xs text-slate-400 dark:text-slate-300">
                    {message.length}/{MESSAGE_MAX}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="feedback-email"
                  className="block text-xs font-medium text-violet-800/70 dark:text-violet-200/85"
                >
                  Votre e-mail <span className="font-normal">(facultatif, pour la réponse)</span>
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="vous@exemple.fr"
                  className={`mt-1 ${INPUT_CLASS}`}
                />
              </div>

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-200">
                  {error} Vous pouvez aussi{" "}
                  <a href={mailto} className="underline underline-offset-2">
                    envoyer le message par e-mail
                  </a>
                  .
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={status === "sending" || !payload.message}
                  className="rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity disabled:opacity-50 dark:from-pink-600 dark:to-fuchsia-700"
                >
                  {status === "sending" ? "Envoi…" : "Envoyer"}
                </button>
                <a
                  href={mailto}
                  className="text-xs text-slate-500 underline underline-offset-2 hover:text-fuchsia-700 dark:text-slate-300 dark:hover:text-fuchsia-300"
                >
                  ou par e-mail
                </a>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
