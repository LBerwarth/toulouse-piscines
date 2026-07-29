import { describe, expect, it } from "vitest";
import { newsKey, parseReading } from "./news-llm";

describe("parseReading", () => {
  it("valide et normalise une lecture complète", () => {
    const r = parseReading({
      pools: [
        {
          slug: "piscine-toulouse-lautrec",
          measures: [{ kind: "extension", close: "21:00", from: "2026-07-29", to: null }],
        },
        {
          slug: "piscine-alex-jany",
          measures: [
            { kind: "closure", dates: ["2026-07-29"] },
            { kind: "extension", close: "9:30", from: "2026-07-30" },
          ],
        },
      ],
      allPools: [],
    });
    expect(r).not.toBeNull();
    expect(r!.pools).toHaveLength(2);
    expect(r!.pools[0].measures[0]).toMatchObject({ kind: "extension", close: "21:00" });
    // « 9:30 » normalisé en « 09:30 »
    expect(r!.pools[1].measures[1].close).toBe("09:30");
  });

  it("extension : « open » seul suffit, sans close ni open elle est jetée", () => {
    const r = parseReading({
      pools: [
        {
          slug: "piscine-papus",
          measures: [
            { kind: "extension", open: "7:00" },
            { kind: "extension" }, // ni close ni open → jetée
          ],
        },
      ],
      allPools: [],
    });
    expect(r!.pools[0].measures).toHaveLength(1);
    expect(r!.pools[0].measures[0]).toMatchObject({ kind: "extension", open: "07:00", close: null });
  });

  it("écarte le déchet : slug inconnu, heures invalides, mesures incomplètes", () => {
    const r = parseReading({
      pools: [
        { slug: "piscine-inconnue", measures: [{ kind: "closure" }] },
        {
          slug: "piscine-papus",
          measures: [
            { kind: "extension" }, // sans heure → jetée
            { kind: "extension", close: "25:00" }, // heure invalide → jetée
            { kind: "partial_closure", windows: [{ start: "14:00", end: "12:00" }] }, // plage inversée → jetée
            { kind: "closure", dates: ["29 juillet", "2026-07-29"], weekdays: [7, 5] },
          ],
        },
      ],
      allPools: [{ kind: "autre" }],
    });
    expect(r!.pools).toHaveLength(1);
    expect(r!.pools[0].slug).toBe("piscine-papus");
    expect(r!.pools[0].measures).toHaveLength(1);
    expect(r!.pools[0].measures[0]).toMatchObject({ kind: "closure", dates: ["2026-07-29"], weekdays: [5] });
    expect(r!.allPools).toEqual([]);
  });

  it("réponse difforme → null", () => {
    expect(parseReading(null)).toBeNull();
    expect(parseReading("oui")).toBeNull();
  });

  it("newsKey suit la convention de collectPoolNews", () => {
    expect(newsKey({ title: "T", text: "corps" })).toBe("T\ncorps");
  });
});
