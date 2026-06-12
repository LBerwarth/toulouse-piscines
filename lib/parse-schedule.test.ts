import { describe, expect, it } from "vitest";
import {
  analyzeDay,
  exceptionalSignature,
  parseDateRange,
  parseDays,
  parseTimeRanges,
  type DayStatus,
} from "./parse-schedule";
import type { PageSections, SectionLine } from "./scrape";
import type { TodayInfo } from "./today";

const today = (
  dateKey: number,
  weekday: number,
  isSchoolHoliday: boolean | null = false
): TodayInfo => ({
  dateKey,
  year: Math.floor(dateKey / 10000),
  weekday,
  isSchoolHoliday,
});

const page = (
  sections: { title: string; lines: SectionLine[] }[],
  intro = "",
  notices: string[] = []
): PageSections => ({
  intro,
  notices,
  sections: sections.map((s) => ({ ...s, body: s.lines.map((l) => l.text).join(" ") })),
});

const text = (t: string): SectionLine => ({ kind: "text", text: t });
const heading = (t: string): SectionLine => ({ kind: "heading", text: t });

describe("parseTimeRanges", () => {
  it("lit « de 9h30 à 20h30 »", () => {
    expect(parseTimeRanges("Samedi et dimanche de 9h30 à 20h30")).toEqual([
      { start: "09:30", end: "20:30" },
    ]);
  });

  it("lit « 12h - 19h » et plusieurs créneaux séparés par /", () => {
    expect(parseTimeRanges("Mardi : 9h - 10h30 / 12h - 14h / 16h - 19h")).toEqual([
      { start: "09:00", end: "10:30" },
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "19:00" },
    ]);
  });

  it("ignore « Fermeture des caisses 1h avant » et « retardée d'1h »", () => {
    expect(parseTimeRanges("Fermeture des caisses 1h avant la fermeture")).toEqual([]);
    expect(parseTimeRanges("En cas d'alerte orange canicule, fermeture retardée d'1h")).toEqual([]);
  });
});

describe("parseDays", () => {
  it("étend « du lundi au vendredi »", () => {
    expect([...parseDays("Du lundi au vendredi de 12h à 19h")!]).toEqual([0, 1, 2, 3, 4]);
  });

  it("lit les énumérations et jours simples", () => {
    expect([...parseDays("Samedi et dimanche , de 12h à 19h")!].sort()).toEqual([5, 6]);
    expect([...parseDays("Le dimanche de 13h30 à 19h30")!]).toEqual([6]);
  });

  it("retourne null sans jour (= tous les jours)", () => {
    expect(parseDays("De 10h à 20h30")).toBeNull();
  });

  it("lit « en semaine » et « le week-end »", () => {
    expect([...parseDays("De 7h à 20h en semaine")!]).toEqual([0, 1, 2, 3, 4]);
    expect([...parseDays("De 10h à 20h le week-end")!].sort()).toEqual([5, 6]);
  });
});

describe("parseDateRange", () => {
  it("lit « du 5 juin au 5 juillet » (année courante)", () => {
    expect(parseDateRange("Du 5 juin au 5 juillet", 2026)).toEqual({
      from: 20260605,
      to: 20260705,
    });
  });

  it("lit « du 24 au 30 août » (mois partagé)", () => {
    expect(parseDateRange("Du 24 au 30 août", 2026)).toEqual({ from: 20260824, to: 20260830 });
  });

  it("lit « à compter du 5 juin 2026 » (fin ouverte)", () => {
    expect(parseDateRange("Horaires période estivale à compter du 5 juin 2026", 2026)).toEqual({
      from: 20260605,
      to: 99999999,
    });
  });

  it("gère une période à cheval sur deux années", () => {
    expect(parseDateRange("du 1er septembre au 30 juin", 2025)).toEqual({
      from: 20250901,
      to: 20260630,
    });
  });
});

describe("analyzeDay — cas réels", () => {
  // Reproduit la page Castex
  const castex = page([
    {
      title: "Horaires période scolaire",
      lines: [text("Le dimanche de 13h30 à 19h30")],
    },
    {
      title: "Horaires période estivale à compter du 5 juin 2026",
      lines: [
        text("Fermeture des caisses 1h avant l'heure de fermeture de la piscine."),
        heading("Du 5 juin au 5 juillet"),
        text("Du lundi au vendredi de 12h à 19h"),
        text("Samedi et dimanche de 9h30 à 20h30"),
        heading("Du 6 juillet au 23 août"),
        text("De 10h à 20h30"),
        heading("Du 24 au 30 août"),
        text("De 10h à 20h"),
      ],
    },
  ]);

  it("Castex un jeudi de juin → 12h-19h (règle semaine de la sous-période)", () => {
    const r = analyzeDay(castex, today(20260611, 3));
    expect(r.openToday).toBe(true);
    expect(r.slotsToday).toEqual([{ start: "12:00", end: "19:00" }]);
    expect(r.confidence).toBe("high");
  });

  it("Castex un samedi de juin → 9h30-20h30", () => {
    const r = analyzeDay(castex, today(20260613, 5));
    expect(r.slotsToday).toEqual([{ start: "09:30", end: "20:30" }]);
  });

  it("Castex mi-juillet → 10h-20h30 tous les jours", () => {
    const r = analyzeDay(castex, today(20260715, 2));
    expect(r.slotsToday).toEqual([{ start: "10:00", end: "20:30" }]);
  });

  it("Castex un lundi en période scolaire → fermée (ouvre seulement le dimanche)", () => {
    const r = analyzeDay(castex, today(20260309, 0));
    expect(r.openToday).toBe(false);
    expect(r.closureReason).toMatch(/lundi/);
  });

  it("Castex un dimanche en période scolaire → 13h30-19h30", () => {
    const r = analyzeDay(castex, today(20260308, 6));
    expect(r.slotsToday).toEqual([{ start: "13:30", end: "19:30" }]);
  });

  it("format par jour « Mardi : 9h - 10h30 / 12h - 14h / 16h - 19h »", () => {
    const lautrec = page([
      {
        title: "Horaires du 18 mai au 3 juillet 2026",
        lines: [
          text("Lundi : 12h - 19h"),
          text("Mardi : 9h - 10h30 / 12h - 14h / 16h - 19h"),
        ],
      },
    ]);
    const r = analyzeDay(lautrec, today(20260602, 1));
    expect(r.slotsToday).toEqual([
      { start: "09:00", end: "10:30" },
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "19:00" },
    ]);
  });

  it("« Fermé le lundi » un lundi → fermée", () => {
    const p = page([
      {
        title: "Horaires",
        lines: [text("Fermé le lundi"), text("Du mardi au dimanche de 10h à 19h")],
      },
    ]);
    const r = analyzeDay(p, today(20260608, 0));
    expect(r.openToday).toBe(false);
    expect(r.closureReason).toMatch(/lundi/i);
  });

  it("fermeture exceptionnelle dans le chapeau → fermée, prime sur les horaires", () => {
    const p = page(
      [{ title: "Horaires", lines: [text("Tous les jours de 10h à 19h")] }],
      "En raison d'un problème technique, la piscine est exceptionnellement fermée."
    );
    const r = analyzeDay(p, today(20260611, 3));
    expect(r.openToday).toBe(false);
    expect(r.closureReason).toMatch(/exceptionnellement fermée/i);
    // La raison n'est pas dupliquée dans les alertes
    expect(r.alerts).toEqual([]);
  });

  it("piscine saisonnière hors saison → fermée, sans incertitude", () => {
    const p = page([
      {
        title: "Horaires d'été",
        lines: [heading("Du 6 juillet au 23 août"), text("De 10h à 20h30")],
      },
    ]);
    const r = analyzeDay(p, today(20260115, 3));
    expect(r.openToday).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("arbitrage scolaire/vacances sans dates via le calendrier zone C", () => {
    const p = page([
      { title: "Horaires période scolaire", lines: [text("Du lundi au vendredi de 12h à 14h")] },
      { title: "Horaires vacances scolaires", lines: [text("Tous les jours de 10h à 19h")] },
    ]);
    const vac = analyzeDay(p, today(20260218, 2, true));
    expect(vac.slotsToday).toEqual([{ start: "10:00", end: "19:00" }]);
    const school = analyzeDay(p, today(20260311, 2, false));
    expect(school.slotsToday).toEqual([{ start: "12:00", end: "14:00" }]);
    // API indisponible → repli période scolaire avec confiance basse
    const unknown = analyzeDay(p, today(20260311, 2, null));
    expect(unknown.slotsToday).toEqual([{ start: "12:00", end: "14:00" }]);
    expect(unknown.confidence).toBe("low");
  });

  it("ligne fusionnée Bellevue (jours collés sans espace) → bons créneaux par jour", () => {
    // Reproduit le <p> avec <br> de Bellevue tel qu'il était aplati avant correction
    const merged =
      "Lundi : 12h - 14hMardi : ferméMercredi : 10h - 14h / 16h - 19hJeudi : 16h - 19hVendredi : 16h - 19hSamedi : 9h30 - 13hDimanche : 8h30 - 13h";
    const p = page([{ title: "Horaires en période scolaire", lines: [text(merged)] }]);

    const jeudi = analyzeDay(p, today(20260611, 3));
    expect(jeudi.slotsToday).toEqual([{ start: "16:00", end: "19:00" }]);

    const mardi = analyzeDay(p, today(20260609, 1));
    expect(mardi.openToday).toBe(false);
    expect(mardi.closureReason).toMatch(/mardi/);

    const mercredi = analyzeDay(p, today(20260610, 2));
    expect(mercredi.slotsToday).toEqual([
      { start: "10:00", end: "14:00" },
      { start: "16:00", end: "19:00" },
    ]);
  });

  it("« (petit bassin fermé de 17h à 19h) » → pas un créneau, pas une alerte (ligne de bassin)", () => {
    const p = page([
      {
        title: "Horaires",
        lines: [text("Jeudi : 12h - 14h / 16h - 19h (petit bassin fermé de 17h à 19h)")],
      },
    ]);
    const r = analyzeDay(p, today(20260611, 3));
    expect(r.slotsToday).toEqual([
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "19:00" },
    ]);
    // L'info est portée par le bassin dérivé, pas par une alerte
    expect(r.alerts).toEqual([]);
    expect(r.basins.some((b) => /petit bassin/i.test(b.label ?? ""))).toBe(true);
  });

  it("deux bassins aux horaires distincts → créneaux fusionnés", () => {
    const p = page([
      {
        title: "Horaires en période scolaire",
        lines: [
          text("Jeudi : 16h - 19h"),
          text("Jeudi : 12h - 14h / 16h - 21h"),
        ],
      },
    ]);
    const r = analyzeDay(p, today(20260611, 3));
    expect(r.slotsToday).toEqual([
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "21:00" },
    ]);
  });

  // Reproduit la page Bellevue (bassins étiquetés + fermeture datée d'un bassin)
  const bellevue = page([
    {
      title: "Horaires en période scolaire",
      lines: [
        // Les étiquettes de bassin sont des sous-titres sur la page réelle
        heading("Bassins sportifs intérieurs"),
        text("Fermeture à compter du 6 juin jusqu'au 30 août 2026"),
        text("Lundi : 12h - 14h"),
        text("Mardi : fermé"),
        text("Jeudi : 16h - 19h"),
        heading("Bassins nordiques extérieurs*"),
        text("Lundi : 12h - 21h"),
        text("Jeudi : 12h - 14h / 16h - 21h"),
        text("*Le petit bassin nordique extérieur est fermé pour la période hivernale"),
      ],
    },
    {
      title: "Horaires d'été à compter du 4 juillet 2026",
      lines: [
        heading("Du 4 juillet au 30 août"),
        text("Bassin nordique uniquement de 10h à 20h"),
        text("Les bassins intérieurs sont fermés"),
      ],
    },
  ]);

  it("Bellevue un jeudi de juin → bassins intérieurs fermés (datés), nordiques ouverts", () => {
    const r = analyzeDay(bellevue, today(20260611, 3));
    expect(r.openToday).toBe(true);
    expect(r.slotsToday).toEqual([
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "21:00" },
    ]);
    const sportifs = r.basins.find((b) => /sportifs/i.test(b.label ?? ""));
    const nordiques = r.basins.find((b) => /nordiques/i.test(b.label ?? ""));
    expect(sportifs?.slots).toEqual([]);
    expect(sportifs?.note).toMatch(/Fermeture à compter du 6 juin/i);
    expect(nordiques?.slots).toEqual([
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "21:00" },
    ]);
  });

  it("Bellevue un jeudi de mai → les deux bassins ouverts, chacun ses créneaux", () => {
    const r = analyzeDay(bellevue, today(20260514, 3));
    const sportifs = r.basins.find((b) => /sportifs/i.test(b.label ?? ""));
    const nordiques = r.basins.find((b) => /nordiques/i.test(b.label ?? ""));
    expect(sportifs?.slots).toEqual([{ start: "16:00", end: "19:00" }]);
    expect(nordiques?.slots).toEqual([
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "21:00" },
    ]);
  });

  it("Bellevue en été → bassin nordique 10h-20h, intérieurs fermés", () => {
    const r = analyzeDay(bellevue, today(20260715, 2));
    const nordique = r.basins.find((b) => b.slots.length > 0);
    expect(nordique?.label).toMatch(/nordique/i);
    expect(nordique?.slots).toEqual([{ start: "10:00", end: "20:00" }]);
    const interieurs = r.basins.find((b) => /intérieurs/i.test(b.label ?? ""));
    expect(interieurs?.slots).toEqual([]);
  });

  it("« (petit bassin fermé de 17h à 19h) » → bassin dérivé aux créneaux réduits", () => {
    const p = page([
      {
        title: "Horaires",
        lines: [text("Jeudi : 12h - 14h / 16h - 19h (petit bassin fermé de 17h à 19h)")],
      },
    ]);
    const r = analyzeDay(p, today(20260611, 3));
    expect(r.basins).toHaveLength(2);
    const petit = r.basins.find((b) => /petit/i.test(b.label ?? ""));
    expect(petit?.slots).toEqual([
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "17:00" },
    ]);
  });

  // Reproduit la page Chapou été (bloc « texte encadré » avec h3 Horaires)
  const chapou = page([
    {
      title: "Horaires jusqu'au 13 septembre 2026",
      lines: [
        text("Fermeture des caisses 1h avant l'heure de fermeture de la piscine."),
        heading("Du 6 juin au 3 juillet"),
        text("De 12h à 19h"),
        heading("Du 4 juillet au 30 août"),
        text("De 7h à 20h en semaine"),
        text("De 10h à 20h le week-end"),
        heading("Du 31 août au 13 septembre"),
        text("De 12h à 19h"),
      ],
    },
  ]);

  it("Chapou été : période en cours, plein été semaine et week-end, hors saison", () => {
    expect(analyzeDay(chapou, today(20260611, 3)).slotsToday).toEqual([
      { start: "12:00", end: "19:00" },
    ]);
    expect(analyzeDay(chapou, today(20260708, 2)).slotsToday).toEqual([
      { start: "07:00", end: "20:00" },
    ]);
    expect(analyzeDay(chapou, today(20260711, 5)).slotsToday).toEqual([
      { start: "10:00", end: "20:00" },
    ]);
    const horsSaison = analyzeDay(chapou, today(20261001, 3));
    expect(horsSaison.openToday).toBe(false);
  });

  it("Toulouse Lautrec : bassin intérieur fermé pour rénovation (annoncé hors horaires)", () => {
    const p = page(
      [
        {
          title: "Horaires du 18 mai au 3 juillet 2026",
          lines: [text("Jeudi : 7h - 14h / 16h - 19h")],
        },
      ],
      "La piscine Toulouse Lautrec est en cours de réhabilitation et d'agrandissement.",
      [
        'Le nouveau bassin sportif nordique, dit "Gisèle Vallerey" de 50 mètres x 4 couloirs a ouvert aux nageurs le 18 mai tandis que la halle et le bassin intérieur fermaient pour rénovation. Les travaux doivent durer deux ans.',
      ]
    );
    const r = analyzeDay(p, today(20260611, 3));
    expect(r.openToday).toBe(true);
    expect(r.slotsToday).toEqual([
      { start: "07:00", end: "14:00" },
      { start: "16:00", end: "19:00" },
    ]);
    const inner = r.basins.find((b) => /bassin intérieur/i.test(b.label ?? ""));
    expect(inner?.slots).toEqual([]);
    expect(inner?.note).toMatch(/rénovation/i);
    // Les horaires principaux portent le nom du bassin annoncé comme ouvert…
    const open = r.basins.find((b) => b.slots.length > 0);
    expect(open?.label).toMatch(/Gisèle Vallerey/);
    // …et ce bassin n'est pas marqué fermé
    expect(r.basins.filter((b) => /vallerey/i.test(b.label ?? "") && b.slots.length === 0)).toEqual(
      []
    );
  });

  it("règles permanentes (canicule, accès Stadium, météo) → PAS d'alerte", () => {
    const p = page(
      [
        {
          title: "Horaires",
          lines: [
            text("Tous les jours de 10h à 20h"),
            text("En cas d'alerte orange canicule, fermeture retardée d'1h"),
          ],
        },
      ],
      "",
      [
        "Lors d'événements et jours de matchs au Stadium, l'accès est modifié.",
        "Le bassin n'est pas accessible en cas de température inférieure à -1°C.",
      ]
    );
    const r = analyzeDay(p, today(20260611, 3));
    expect(r.openToday).toBe(true);
    expect(r.alerts).toEqual([]);
  });

  it("événement exceptionnel non bloquant (vidange annoncée) → alerte", () => {
    const p = page(
      [{ title: "Horaires", lines: [text("Tous les jours de 10h à 20h")] }],
      "",
      ["La vidange annuelle du bassin aura lieu du 15 au 20 juin."]
    );
    const r = analyzeDay(p, today(20260611, 3));
    expect(r.openToday).toBe(true);
    expect(r.alerts.some((a) => /vidange/i.test(a))).toBe(true);
  });

  // Reproduit la page Léo Lagrange : ligne de fermeture partielle du petit
  // bassin AVEC jours et heures, au milieu de la grille d'horaires
  const leoLagrange = page([
    {
      title: "Horaires vacances scolaires (hors été)",
      lines: [
        text("Lundi : 14h - 21h"),
        text("Mardi : 9h - 12h / 14h - 21h"),
        text(
          "Le petit bassin de la piscine Léo Lagrange est fermé le lundi, mardi et mercredi de 18h à 21h."
        ),
        text("Jeudi : 9h - 12h / 14h - 18h"),
        text("Vendredi : 9h - 12h / 14h - 18h"),
      ],
    },
  ]);

  it("Léo Lagrange : « petit bassin fermé lundi…de 18h à 21h » → créneaux RÉDUITS, pas une ouverture", () => {
    const r = analyzeDay(leoLagrange, today(20260615, 0, true)); // lundi, vacances
    expect(r.slotsToday).toEqual([{ start: "14:00", end: "21:00" }]);
    const petit = r.basins.find((b) => /petit bassin/i.test(b.label ?? ""));
    // fermé 18h-21h → ouvert seulement 14h-18h (et surtout PAS « ouvert 18h-21h »)
    expect(petit?.slots).toEqual([{ start: "14:00", end: "18:00" }]);
  });

  it("Léo Lagrange : la ligne de fermeture ne capture pas les jours suivants (Jeudi reste au bassin principal)", () => {
    const r = analyzeDay(leoLagrange, today(20260618, 3, true)); // jeudi, vacances
    expect(r.openToday).toBe(true);
    expect(r.slotsToday).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]);
    // les horaires du jeudi appartiennent au bassin principal (label null)
    expect(r.basins.find((b) => b.slots.length > 0)?.label).toBeNull();
    // le petit bassin reste affiché, aux horaires complets de la piscine
    // (sa fermeture ne s'applique pas le jeudi)
    const petit = r.basins.find((b) => /petit bassin/i.test(b.label ?? ""));
    expect(petit?.slots).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]);
  });

  it("bloc « vacances » choisi faute de mieux en période scolaire → confiance faible", () => {
    // Léo Lagrange réel : le bloc scolaire est daté « jusqu'au 5 juin 2026 »
    // et expiré, il ne reste que le bloc vacances alors qu'on est en période
    // scolaire.
    const p = page([
      {
        title: "Horaires en période scolaire jusqu'au 5 juin 2026",
        lines: [text("Lundi : 12h - 14h / 16h - 21h")],
      },
      {
        title: "Horaires vacances scolaires (hors été)",
        lines: [text("Lundi : 14h - 21h")],
      },
    ]);
    const r = analyzeDay(p, today(20260615, 0, false)); // lundi 15 juin, période scolaire
    expect(r.slotsToday).toEqual([{ start: "14:00", end: "21:00" }]);
    expect(r.confidence).toBe("low");
  });

  it("fermeture exceptionnelle datée « jusqu'au … » → fermée pendant, ouverte après (vue semaine)", () => {
    const p = page(
      [{ title: "Horaires", lines: [text("Tous les jours de 10h à 20h")] }],
      "La piscine est fermée jusqu'au 14 juin 2026 en raison d'un problème technique."
    );
    const pendant = analyzeDay(p, today(20260612, 4));
    expect(pendant.openToday).toBe(false);
    expect(pendant.closureReason).toMatch(/problème technique/i);
    const apres = analyzeDay(p, today(20260615, 0));
    expect(apres.openToday).toBe(true);
    expect(apres.slotsToday).toEqual([{ start: "10:00", end: "20:00" }]);
  });

  it("Alex Jany : le petit bassin apparaît aussi les jours SANS restriction (horaires complets)", () => {
    const p = page([
      {
        title: "Horaires en période scolaire",
        lines: [
          text("Jeudi : 12h - 14h / 16h - 19h (petit bassin fermé de 17h à 19h)"),
          text("Vendredi : 12h - 14h / 16h - 21h (petit bassin fermé de 17h à 21h)"),
          text("Samedi : 15h - 19h"),
        ],
      },
    ]);
    // Samedi : aucune restriction → petit bassin aux horaires de la piscine
    const samedi = analyzeDay(p, today(20260613, 5));
    const petitSam = samedi.basins.find((b) => /petit/i.test(b.label ?? ""));
    expect(petitSam?.slots).toEqual([{ start: "15:00", end: "19:00" }]);
    // Vendredi : restriction du vendredi (17h-21h), pas celle du jeudi
    const vendredi = analyzeDay(p, today(20260612, 4));
    const petitVen = vendredi.basins.find((b) => /petit/i.test(b.label ?? ""));
    expect(petitVen?.slots).toEqual([
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "17:00" },
    ]);
    // …et une seule ligne « petit bassin », pas une par parenthèse
    expect(vendredi.basins.filter((b) => /petit/i.test(b.label ?? ""))).toHaveLength(1);
  });

  it("fermeture exceptionnelle à date unique « le samedi 20 juin » → fermée ce jour-là seulement", () => {
    const p = page(
      [{ title: "Horaires", lines: [text("Tous les jours de 10h à 20h")] }],
      "La piscine sera exceptionnellement fermée le samedi 20 juin pour une compétition."
    );
    expect(analyzeDay(p, today(20260620, 5)).openToday).toBe(false);
    expect(analyzeDay(p, today(20260619, 4)).openToday).toBe(true);
    expect(analyzeDay(p, today(20260621, 6)).openToday).toBe(true);
  });
});

describe("exceptionalSignature — déclencheur des notifications", () => {
  const dayStatus = (over: Partial<DayStatus>): DayStatus => ({
    openToday: true,
    slotsToday: [],
    closureReason: null,
    alerts: [],
    confidence: "high",
    basins: [],
    ...over,
  });

  it("une fermeture NORMALE (jour de repos) ne déclenche rien", () => {
    expect(exceptionalSignature(dayStatus({ openToday: false, closureReason: "Pas d'ouverture le lundi" }))).toBeNull();
    expect(exceptionalSignature(dayStatus({}))).toBeNull();
  });

  it("une fermeture pour problème technique déclenche", () => {
    const sig = exceptionalSignature(
      dayStatus({ openToday: false, closureReason: "La piscine est fermée pour un problème technique." })
    );
    expect(sig).toMatch(/problème technique/i);
  });

  it("une grève déclenche", () => {
    expect(exceptionalSignature(dayStatus({ alerts: ["Fermeture en raison d'une grève le 15 juin."] }))).toMatch(
      /grève/i
    );
  });

  it("une vidange annoncée déclenche", () => {
    expect(exceptionalSignature(dayStatus({ alerts: ["La vidange annuelle aura lieu du 15 au 20 juin."] }))).toMatch(
      /vidange/i
    );
  });

  it("grève annoncée dans le chapeau → détectée de bout en bout", () => {
    const p = page(
      [{ title: "Horaires", lines: [text("Tous les jours de 10h à 20h")] }],
      "La piscine sera fermée en raison d'une grève nationale."
    );
    const day = analyzeDay(p, today(20260611, 3));
    expect(exceptionalSignature(day)).toMatch(/grève/i);
  });
});
