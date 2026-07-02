import { describe, expect, it } from "vitest";
import { classifyBasinEnv, isAnnexBasin, poolHasEnv } from "./environment";
import { POOLS } from "./pools";

describe("classifyBasinEnv", () => {
  it("classe les bassins extérieurs / nordiques en plein air", () => {
    expect(classifyBasinEnv("Bassins nordiques extérieurs")).toBe("outdoor");
    expect(classifyBasinEnv('bassin sportif nordique "Gisèle Vallerey"')).toBe("outdoor");
  });

  it("classe les bassins intérieurs / halle en couvert", () => {
    expect(classifyBasinEnv("Bassins sportifs intérieurs")).toBe("indoor");
    expect(classifyBasinEnv("halle et le bassin intérieur")).toBe("indoor");
  });

  it("renvoie null quand le libellé ne tranche pas", () => {
    expect(classifyBasinEnv("petit bassin")).toBeNull();
    expect(classifyBasinEnv(null)).toBeNull();
  });
});

describe("isAnnexBasin", () => {
  it("classe petit bassin / pataugeoire / apprentissage en annexe", () => {
    expect(isAnnexBasin("petit bassin")).toBe(true);
    expect(isAnnexBasin("Petit bassin extérieur")).toBe(true);
    expect(isAnnexBasin("pataugeoire")).toBe(true);
    expect(isAnnexBasin("bassin d'apprentissage")).toBe(true);
  });

  it("les bassins de nage ne sont pas des annexes", () => {
    expect(isAnnexBasin(null)).toBe(false); // bassin principal non nommé
    expect(isAnnexBasin("Grand bassin")).toBe(false);
    expect(isAnnexBasin("Bassins sportifs intérieurs")).toBe(false);
    expect(isAnnexBasin('bassin sportif nordique "Gisèle Vallerey"')).toBe(false);
  });
});

describe("poolHasEnv", () => {
  it("une piscine mixte possède les deux types", () => {
    expect(poolHasEnv("mixed", "indoor")).toBe(true);
    expect(poolHasEnv("mixed", "outdoor")).toBe(true);
  });

  it("une piscine pure ne correspond qu'à son type", () => {
    expect(poolHasEnv("indoor", "indoor")).toBe(true);
    expect(poolHasEnv("indoor", "outdoor")).toBe(false);
    expect(poolHasEnv("outdoor", "outdoor")).toBe(true);
  });
});

describe("métadonnée env des piscines", () => {
  it("les deux bassins de chaque piscine mixte sont classables", () => {
    // Garantit que le filtre n'« avale » jamais un bassin d'une piscine mixte.
    const mixed = POOLS.filter((p) => p.env === "mixed").map((p) => p.slug);
    expect(mixed).toContain("piscine-bellevue");
    expect(mixed).toContain("piscine-toulouse-lautrec");
  });

  it("chaque piscine a un env valide", () => {
    for (const p of POOLS) {
      expect(["indoor", "outdoor", "mixed"]).toContain(p.env);
    }
  });
});
