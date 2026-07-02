import { describe, expect, it } from "vitest";
import { POOLS, poolHasBasinLength } from "./pools";
import { poolHasEnv } from "./environment";

describe("métadonnées basins (longueurs 25/50 m)", () => {
  it("chaque bassin déclaré est cohérent avec l'env de sa piscine", () => {
    // Un bassin « outdoor » ne peut exister que dans une piscine outdoor/mixte —
    // sinon le filtre combiné (longueur × emplacement) mentirait.
    for (const p of POOLS) {
      for (const b of p.basins) {
        expect(poolHasEnv(p.env, b.env), `${p.slug} : bassin ${b.length} m ${b.env}`).toBe(true);
      }
    }
  });

  it("les piscines à bassin de 50 m sont Castex, Léo Lagrange et Toulouse Lautrec", () => {
    const with50 = POOLS.filter((p) => poolHasBasinLength(p, 50))
      .map((p) => p.slug)
      .sort();
    expect(with50).toEqual([
      "piscine-castex",
      "piscine-leo-lagrange",
      "piscine-toulouse-lautrec",
    ]);
  });

  it("filtre combiné longueur × emplacement : 50 m en plein air / en intérieur", () => {
    const outdoor50 = POOLS.filter((p) => poolHasBasinLength(p, 50, "outdoor"))
      .map((p) => p.slug)
      .sort();
    expect(outdoor50).toEqual(["piscine-castex", "piscine-toulouse-lautrec"]);
    const indoor50 = POOLS.filter((p) => poolHasBasinLength(p, 50, "indoor")).map((p) => p.slug);
    expect(indoor50).toEqual(["piscine-leo-lagrange"]);
  });

  it("Toulouse Lautrec : 25 m intérieur (en rénovation) + 50 m nordique extérieur", () => {
    const tl = POOLS.find((p) => p.slug === "piscine-toulouse-lautrec")!;
    expect(poolHasBasinLength(tl, 25, "indoor")).toBe(true);
    expect(poolHasBasinLength(tl, 50, "outdoor")).toBe(true);
    expect(poolHasBasinLength(tl, 25, "outdoor")).toBe(false);
    expect(poolHasBasinLength(tl, 50, "indoor")).toBe(false);
  });

  it("Bellevue offre du 25 m dans les deux emplacements", () => {
    const bellevue = POOLS.find((p) => p.slug === "piscine-bellevue")!;
    expect(poolHasBasinLength(bellevue, 25, "indoor")).toBe(true);
    expect(poolHasBasinLength(bellevue, 25, "outdoor")).toBe(true);
    expect(poolHasBasinLength(bellevue, 50)).toBe(false);
  });
});
