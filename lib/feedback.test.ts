import { describe, expect, it } from "vitest";
import { MESSAGE_MAX, feedbackText, parseFeedback } from "./feedback";

const base = {
  kind: "horaires",
  poolSlug: "piscine-alex-jany",
  message: "Alex Jany est affichée fermée aujourd'hui alors que la fermeture est demain.",
  email: "nageur@exemple.fr",
};

describe("parseFeedback", () => {
  it("accepte un signalement complet", () => {
    const r = parseFeedback(base);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toEqual({
      kind: "horaires",
      poolSlug: "piscine-alex-jany",
      message: base.message,
      email: "nageur@exemple.fr",
    });
  });

  it("refuse un message vide ou trop long", () => {
    expect(parseFeedback({ ...base, message: "   " }).ok).toBe(false);
    expect(parseFeedback({ ...base, message: "x".repeat(MESSAGE_MAX + 1) }).ok).toBe(false);
    expect(parseFeedback({}).ok).toBe(false);
  });

  it("refuse une adresse e-mail mal formée plutôt que de la perdre en silence", () => {
    const r = parseFeedback({ ...base, email: "nageur@exemple" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/e-mail/i);
  });

  it("traite l'e-mail absent comme facultatif", () => {
    const r = parseFeedback({ ...base, email: "  " });
    expect(r.ok && r.value.email).toBeNull();
  });

  it("ramène une nature ou une piscine inconnue au cas général", () => {
    const r = parseFeedback({ ...base, kind: "n'importe quoi", poolSlug: "piscine-inexistante" });
    expect(r.ok && r.value.kind).toBe("autre");
    expect(r.ok && r.value.poolSlug).toBeNull();
  });
});

describe("feedbackText", () => {
  it("nomme la piscine et signale l'absence d'adresse de réponse", () => {
    const texte = feedbackText({
      kind: "fermeture",
      poolSlug: "piscine-castex",
      message: "Fermée alors que l'appli l'annonce ouverte.",
      email: null,
    });
    expect(texte).toMatch(/Castex/);
    expect(texte).toMatch(/pas d'adresse/i);
    expect(texte).toMatch(/Fermée alors que/);
  });
});
