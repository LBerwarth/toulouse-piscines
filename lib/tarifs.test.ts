import { describe, expect, it } from "vitest";
import { poolTarifs, tarifVerifications } from "./tarifs";
import { POOLS } from "./pools";

describe("poolTarifs", () => {
  it("donne le barème commun de la mairie à toutes les piscines de Toulouse", () => {
    const toulouse = POOLS.filter((p) => p.zone === "toulouse");
    for (const p of toulouse) {
      expect(poolTarifs(p.slug)?.entries[0], p.slug).toEqual({
        label: "Toulousains",
        prix: "3,40 €",
      });
    }
  });

  it("donne un barème propre aux piscines hors Toulouse qui le publient", () => {
    expect(poolTarifs("piscine-balma")?.entries[0].prix).toBe("3,55 €");
    expect(poolTarifs("espace-nautique-jean-vauchere")?.entries[0].prix).toBe("4,80 €");
  });

  it("ne rend rien pour Plaisance-du-Touch (tarifs non publiés en ligne)", () => {
    expect(poolTarifs("piscine-plaisance-du-touch")).toBeNull();
  });

  it("ne rend rien pour un slug inconnu", () => {
    expect(poolTarifs("piscine-inconnue")).toBeNull();
  });
});

describe("tarifVerifications", () => {
  it("contrôle chaque barème relevé en ligne (Balma vient d'une affiche papier)", () => {
    const sources = tarifVerifications().map((v) => v.source);
    // 1 (Toulouse) + 6 hors Toulouse vérifiables ; Balma exclue (image).
    expect(sources).toHaveLength(7);
    expect(sources.some((s) => s.includes("mairie-balma"))).toBe(false);
    for (const v of tarifVerifications()) {
      expect(v.expect.length).toBeGreaterThan(0);
    }
  });
});
