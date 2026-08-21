import { describe, expect, it } from "vitest";
import { parseProseBlockPage } from "./prose-block";

const CONFIG = { blockSelector: ".ce-bodytext", blockTitle: /^horaires$/i };

// Structure réelle de la page des Ramiers (Blagnac) : horaires, tarifs et
// grilles de cours partagent la même classe de bloc.
const html = `
  <div class="ce-bodytext">
    <h2><strong>HORAIRES</strong></h2>
    <h4><strong>Jusqu'au 6 septembre 2026</strong></h4>
    <p><strong>Bassin nordique</strong></p>
    <ul><li>Ouvert tous les jours de 10h à 20h*</li><li>Ouverture dès 8h30 les mardis</li></ul>
    <p><strong>Bassin intérieur</strong></p>
    <ul><li>Du lundi au vendredi : 11h45 à 18h45</li><li>Samedi, dimanche et jours fériés : 10h à 20h*</li></ul>
  </div>
  <div class="ce-bodytext">
    <h2><strong>ACTIVITES</strong></h2>
    <p><strong>Aquabike</strong></p>
    <p>Horaires</p>
    <ul><li>Lundi : de 12h15 à 13h</li><li>Jeudi : de 16h15 à 17h</li></ul>
  </div>
  <a href="tel:0561717631">Appeler</a>`;

describe("parseProseBlockPage", () => {
  it("ne retient que le bloc d'horaires, pas les grilles de cours", () => {
    const page = parseProseBlockPage(html, CONFIG);

    expect(page.sections).toHaveLength(1);
    const texts = page.sections[0].lines.map((l) => l.text);
    expect(texts).toContain("Du lundi au vendredi : 11h45 à 18h45");
    // Le créneau d'aquabike ne doit pas passer pour un horaire d'ouverture
    expect(texts.some((t) => /12h15/.test(t))).toBe(false);
  });

  it("promeut la période en titre de section, dans le vocabulaire de buildBlocks", () => {
    // « Jusqu'au 6 septembre 2026 » seul serait ignoré par buildBlocks.
    expect(parseProseBlockPage(html, CONFIG).sections[0].title).toBe(
      "Horaires jusqu'au 6 septembre 2026"
    );
  });

  it("garde les étiquettes de bassin comme lignes, pour le tri intérieur/plein air", () => {
    const texts = parseProseBlockPage(html, CONFIG).sections[0].lines.map((l) => l.text);
    expect(texts).toContain("Bassin nordique");
    expect(texts).toContain("Bassin intérieur");
  });

  it("relève le téléphone de l'accueil", () => {
    expect(parseProseBlockPage(html, CONFIG).phone).toBe("0561717631");
  });

  it("ne rend aucune section quand le bloc est absent", () => {
    expect(parseProseBlockPage("<div><p>12h - 19h</p></div>", CONFIG).sections).toHaveLength(0);
  });
});
