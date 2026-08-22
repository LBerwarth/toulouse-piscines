import { describe, expect, it } from "vitest";
import { parseBalmaPage } from "./balma";

// Structure réelle : la grille est du texte brut séparé par des <br> dans une
// fiche contact, et le standard de la mairie apparaît avant le numéro de la
// piscine.
const html = `
  <div class="contact-card"><h2>Coordonnées</h2>
    <a href="tel:0561249292">05 61 24 92 92</a>
  </div>
  <div class="contact-card"><h2>Horaires d'ouverture</h2>
    Du mardi 30 juin au samedi 1er août 2026 et du mardi 25 août au samedi 29 août 2026 :<br />
    - Mardi : 12h - 19h<br />
    - Mercredi : 12h - 19h<br />
    - Samedi : 10h - 18h
  </div>
  <div class="bloc-content bloc-content--paragraph">
    <p>Infos au <a href="tel:0562577780">05 62 57 77 80</a> ou par mail à piscine@mairie-balma.fr</p>
  </div>
  <div class="bloc-content bloc-content--paragraph">
    <p>La Piscine municipale de Balma a bénéficié de travaux importants en 2022.</p>
  </div>
  <div class="bloc-content bloc-content--paragraph">
    <p><strong>⚠️ ÉTABLISSEMENT FERMÉ POUR TRAVAUX DU 3 AU 24 AOÛT 2026.</strong></p>
  </div>`;

describe("parseBalmaPage", () => {
  it("fait une section par plage, quand une grille en couvre deux", () => {
    // parseDateRange n'en lit qu'une : sans dédoublement, la seconde période
    // paraîtrait fermée faute de bloc la couvrant.
    // Les deux grilles figées de la rentrée (relevées de l'affiche) suivent.
    expect(parseBalmaPage(html).sections.map((s) => s.title)).toEqual([
      "Horaires du mardi 30 juin au samedi 1er août 2026",
      "Horaires du mardi 25 août au samedi 29 août 2026",
      "Horaires en période scolaire (à partir du 30 août 2026)",
      "Horaires vacances scolaires (à partir du 30 août 2026)",
    ]);
  });

  it("porte la grille de rentrée même si la page ne publie que l'été", () => {
    // Sans grille dans la page, les blocs relevés de l'affiche restent : la
    // piscine ne redevient pas « sans horaires » à la fin de l'été.
    const bare = parseBalmaPage("<div></div>");
    expect(bare.sections.map((s) => s.title)).toEqual([
      "Horaires en période scolaire (à partir du 30 août 2026)",
      "Horaires vacances scolaires (à partir du 30 août 2026)",
    ]);
  });

  it("sépare les règles sur les <br> et retire les tirets de liste", () => {
    expect(parseBalmaPage(html).sections[0].lines.map((l) => l.text)).toEqual([
      "Mardi : 12h - 19h",
      "Mercredi : 12h - 19h",
      "Samedi : 10h - 18h",
    ]);
  });

  it("remonte la fermeture pour travaux, pas le récit des rénovations passées", () => {
    const notices = parseBalmaPage(html).notices;
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(/FERMÉ POUR TRAVAUX DU 3 AU 24 AOÛT/);
  });

  it("prend le numéro de la piscine, pas le standard de la mairie", () => {
    expect(parseBalmaPage(html).phone).toBe("0562577780");
  });
});
