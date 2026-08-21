import { describe, expect, it } from "vitest";
import { fitView, groupSites, MAP_VIEWS } from "./map-geometry";
import { POOLS, POOL_COORDS } from "./pools";

describe("fitView", () => {
  it("choisit la vue ville pour des piscines du centre", () => {
    expect(fitView(["piscine-papus", "piscine-leo-lagrange"])).toBe("toulouse");
  });

  it("élargit à la métropole dès qu'une piscine sort du cadre ville", () => {
    expect(fitView(["piscine-papus", "espace-nautique-jean-vauchere"])).toBe("metropole");
    expect(fitView(["complexe-nautique-des-ramiers"])).toBe("metropole");
  });

  it("élargit à l'aire urbaine pour Léguevin", () => {
    expect(fitView(["piscine-papus", "piscine-leguevin"])).toBe("all");
  });

  it("ignore une piscine sans coordonnées plutôt que d'élargir au maximum", () => {
    expect(fitView(["piscine-papus", "slug-inconnu"])).toBe("toulouse");
  });

  it("contient chaque piscine géolocalisée dans la vue qu'elle choisit", () => {
    // Garantit que les cadres (VIEW_BOUNDS) couvrent toutes les coordonnées :
    // une piscine ajoutée hors cadre casserait ce test au lieu de sortir du plan.
    for (const pool of POOLS) {
      if (!POOL_COORDS[pool.slug]) continue;
      const zone = fitView([pool.slug]);
      const { project, width, height } = MAP_VIEWS[zone];
      const p = project(POOL_COORDS[pool.slug]);
      expect(p.x, pool.slug).toBeGreaterThanOrEqual(0);
      expect(p.x, pool.slug).toBeLessThanOrEqual(width);
      expect(p.y, pool.slug).toBeGreaterThanOrEqual(0);
      expect(p.y, pool.slug).toBeLessThanOrEqual(height);
    }
  });
});

describe("groupSites", () => {
  it("fusionne les piscines du même complexe en un seul repère", () => {
    const sites = groupSites(
      ["piscine-alfred-nakache-ete", "piscine-alfred-nakache-hiver", "piscine-castex"],
      "toulouse"
    );
    expect(sites).toHaveLength(1);
    expect(sites[0].slugs).toHaveLength(3);
  });
});
