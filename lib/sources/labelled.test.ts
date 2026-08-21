import { describe, expect, it } from "vitest";
import { parseLabelledPage } from "./labelled";

// Structure réelle de Launaguet : les intitulés sont des <li>, les valeurs les
// <p> qui suivent, et le numéro est en clair sans lien « tel: ».
const html = `
  <div class="entry-content">
    <p>Piscine d'été composée d'un grand bassin (12x25m) et d'une pataugeoire.</p>
    <p><strong>Téléphone: 07 61 08 18 07</strong></p>
    <ul><li><strong>Dates d'ouverture</strong></li></ul>
    <p>Du samedi 4 juillet au dimanche 30 août 2026</p>
    <ul><li><strong>Horaires d'ouverture</strong></li></ul>
    <p>Du mardi au dimanche de 12h30 à 19h30</p>
    <ul><li><strong>Tarifs</strong></li></ul>
    <p>Gratuit pour les moins de 2 ans</p>
  </div>`;

const CONFIG = {
  blockSelector: ".entry-content",
  seasonLabel: /dates d.ouverture/i,
  hoursLabel: /horaires d.ouverture/i,
};

describe("parseLabelledPage", () => {
  it("met la saison dans le titre, pour que le bloc soit daté", () => {
    // Sans plage dans le titre, la piscine d'été paraîtrait ouverte en janvier.
    const page = parseLabelledPage(html, CONFIG);
    expect(page.sections).toHaveLength(1);
    expect(page.sections[0].title).toBe("Horaires Du samedi 4 juillet au dimanche 30 août 2026");
    expect(page.sections[0].lines).toEqual([
      { kind: "text", text: "Du mardi au dimanche de 12h30 à 19h30" },
    ]);
  });

  it("relève un numéro écrit en clair", () => {
    expect(parseLabelledPage(html, CONFIG).phone).toBe("0761081807");
  });

  it("ne rend rien quand l'intitulé des horaires est absent", () => {
    const page = parseLabelledPage(`<div class="entry-content"><p>12h - 19h</p></div>`, CONFIG);
    expect(page.sections).toHaveLength(0);
  });
});
