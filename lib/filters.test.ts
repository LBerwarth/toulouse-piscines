import { describe, expect, it } from "vitest";
import {
  parseFilterCookie,
  readFilterPreset,
  serializeFilterCookie,
  ZONES_KEPT,
  type FilterPreset,
} from "./filters";

describe("readFilterPreset", () => {
  it("montre Toulouse et la métropole par défaut", () => {
    expect(readFilterPreset({}).zone).toBe("metropole");
  });

  it("lit le secteur des raccourcis du lanceur", () => {
    expect(readFilterPreset({ secteur: "toulouse" }).zone).toBe("toulouse");
    expect(readFilterPreset({ secteur: "tout" }).zone).toBe("all");
  });
});

describe("cookie de filtres", () => {
  const preset: FilterPreset = { zone: "all", env: "outdoor", length: 50, open: "now", fav: true };

  it("retrouve les mêmes filtres après un aller-retour", () => {
    expect(readFilterPreset(parseFilterCookie(serializeFilterCookie(preset)))).toEqual(preset);
  });

  it("retrouve aussi les filtres neutres", () => {
    const neutral: FilterPreset = {
      zone: "metropole",
      env: "all",
      length: "all",
      open: "all",
      fav: false,
    };
    expect(readFilterPreset(parseFilterCookie(serializeFilterCookie(neutral)))).toEqual(neutral);
  });

  it("ne rend rien sans cookie", () => {
    expect(parseFilterCookie(undefined)).toEqual({});
  });

  it("laisse les paramètres d'URL primer sur le cookie mémorisé", () => {
    // Un raccourci « 50 m » doit montrer les 50 m même si la dernière visite
    // s'était terminée sur « 25 m » — c'est la fusion faite dans app/page.tsx.
    const cookie = parseFilterCookie(serializeFilterCookie({ ...preset, length: 25 }));
    expect(readFilterPreset({ ...cookie, longueur: "50" }).length).toBe(50);
  });
});

describe("ZONES_KEPT", () => {
  it("emboîte les secteurs au lieu de les exclure", () => {
    expect(ZONES_KEPT.toulouse).toEqual(["toulouse"]);
    expect(ZONES_KEPT.metropole).toContain("toulouse");
    expect(ZONES_KEPT.all).toContain("metropole");
    expect(ZONES_KEPT.all).toContain("alentours");
  });
});
