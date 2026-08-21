import { describe, expect, it } from "vitest";
import { parseOasisPage } from "./oasis";

// Structure réelle : un <br> suivi d'un vrai saut de ligne dans la source, un
// bloc « petit bassin » sans titre de période, et des en-têtes de mois dans la
// grille d'été.
const schedule = `
  <section id="page-horaires">
    <div class="tableau ete">
      <h3>Horaires d'été (Du Dimanche 05 Juillet au Dimanche 02 Août inclus)</h3>
      <ul>
        <li><h4>Juillet</h4><div class="fromrte">
          <p><strong>Lundi au vendredi :</strong><br />
12h - 19h</p><p><strong>Samedi au Dimanche :</strong><br />
13h - 19h</p></div></li>
        <li><h4>Août</h4><div class="fromrte"><p>Fermeture annuelle</p></div></li>
      </ul>
    </div>
    <div class="tableau scolaire">
      <h3>Période scolaire</h3>
      <ul>
        <li><h4>Lundi</h4><div class="fromrte"><p>12h - 14h15<br />
16h30 - 19h</p></div></li>
        <li><h4>Samedi</h4><div class="fromrte"><p>Réservé aux<br />
Associations</p></div></li>
      </ul>
    </div>
    <div class="tableau scolaire-pb">
      <div class="bassin">Disponibilités du Petit bassin</div>
      <ul><li><h4>Lundi</h4><div class="fromrte"><p>13h - 14h</p></div></li></ul>
    </div>
  </section>`;

const home = `<aside id="home-alerte"><h2>PISCINE OUVERTE</h2>
  <h2>Pause technique du lundi 3 août au dimanche 13 septembre 2026... On vous prépare une rentrée !!</h2></aside>`;

describe("parseOasisPage", () => {
  it("assemble jour et créneaux sur une ligne, sans « et » en double", () => {
    const scolaire = parseOasisPage(schedule, null).sections.find(
      (s) => s.title === "Période scolaire"
    )!;
    expect(scolaire.lines[0].text).toBe("Lundi : 12h - 14h15 et 16h30 - 19h");
  });

  it("garde les règles de la grille d'été en prose, jour et heures appariés", () => {
    const ete = parseOasisPage(schedule, null).sections[0];
    const texts = ete.lines.map((l) => l.text);
    expect(texts).toContain("Lundi au vendredi : 12h - 19h");
    expect(texts).toContain("Samedi au Dimanche : 13h - 19h");
  });

  it("rattache le petit bassin à la grille qui précède, en ligne de bassin", () => {
    const sections = parseOasisPage(schedule, null).sections;
    expect(sections.map((s) => s.title)).toEqual([
      "Horaires d'été (Du Dimanche 05 Juillet au Dimanche 02 Août inclus)",
      "Période scolaire",
    ]);
    const texts = sections[1].lines.map((l) => l.text);
    expect(texts).toContain("Disponibilités du Petit bassin");
  });

  it("traduit la pause technique dans le vocabulaire de findStrongClosure", () => {
    // Sans réécriture, une fermeture d'un mois passerait inaperçue ; et le
    // bandeau garde son titre « PISCINE OUVERTE », qu'il faut écarter.
    const intro = parseOasisPage(schedule, home).intro;
    expect(intro).toMatch(
      /^Piscine fermée pour pause technique du lundi 3 août au dimanche 13 septembre 2026/
    );
  });

  it("reste lisible sans le bandeau de l'accueil", () => {
    const page = parseOasisPage(schedule, null);
    expect(page.intro).toBe("");
    expect(page.sections.length).toBeGreaterThan(0);
  });
});
