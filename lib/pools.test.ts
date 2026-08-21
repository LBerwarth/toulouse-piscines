import { describe, expect, it } from "vitest";
import { POOLS, POOL_COORDS, poolHasBasinLength, poolUrl } from "./pools";
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

  it("les piscines à bassin de 50 m sont Castex, Léo Lagrange, Toulouse Lautrec et Les Ramiers", () => {
    const with50 = POOLS.filter((p) => poolHasBasinLength(p, 50))
      .map((p) => p.slug)
      .sort();
    expect(with50).toEqual([
      "complexe-nautique-des-ramiers",
      "piscine-castex",
      "piscine-leo-lagrange",
      "piscine-toulouse-lautrec",
    ]);
  });

  it("filtre combiné longueur × emplacement : 50 m en plein air / en intérieur", () => {
    const outdoor50 = POOLS.filter((p) => poolHasBasinLength(p, 50, "outdoor"))
      .map((p) => p.slug)
      .sort();
    expect(outdoor50).toEqual([
      "complexe-nautique-des-ramiers",
      "piscine-castex",
      "piscine-toulouse-lautrec",
    ]);
    expect(POOLS.filter((p) => poolHasBasinLength(p, 25, "outdoor")).map((p) => p.slug)).toContain(
      "piscine-launaguet"
    );
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

describe("secteurs et sources", () => {
  it("donne à chaque piscine une commune et un secteur", () => {
    for (const p of POOLS) {
      expect(p.commune, p.slug).not.toBe("");
      expect(["toulouse", "metropole", "alentours"], p.slug).toContain(p.zone);
    }
  });

  it("n'utilise le secteur « toulouse » que pour la commune de Toulouse", () => {
    for (const p of POOLS) {
      expect(p.zone === "toulouse", p.slug).toBe(p.commune === "Toulouse");
    }
  });

  it("donne une URL explicite à toute piscine hors site de la mairie de Toulouse", () => {
    for (const p of POOLS.filter((x) => x.source && x.source !== "toulouse")) {
      expect(p.url, p.slug).toMatch(/^https:\/\//);
    }
  });

  it("garde les slugs uniques (Alex Jany existe aussi à Ramonville)", () => {
    const slugs = POOLS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("déduit l'URL du slug pour les piscines de Toulouse", () => {
    const p = POOLS.find((x) => x.slug === "piscine-papus")!;
    expect(poolUrl(p)).toBe("https://metropole.toulouse.fr/annuaire/piscine-papus");
  });

  it("ne place sur le plan que les piscines dont on a relevé les coordonnées", () => {
    // Le plan est cadré sur la ville : une piscine sans coordonnées est
    // simplement absente du plan (cf. groupSites), pas une erreur.
    for (const slug of Object.keys(POOL_COORDS)) {
      expect(POOLS.some((p) => p.slug === slug), slug).toBe(true);
    }
  });
});
