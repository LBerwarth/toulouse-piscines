import { describe, expect, it } from "vitest";
import { parseLeguevinPage } from "./leguevin";

const html = `
  <h2>Ouverture au public – été 2026</h2>
  <p>Ouverture : <strong>Samedi 4 juillet 2026</strong><br>Fermeture : <strong>Dimanche 30 août 2026</strong></p>
  <p>La piscine municipale sera ouverte au public de <strong>13h00 à 19h00</strong>, tous les jours
  du 4 juillet 2026 au 30 août 2026 (fermeture de la caisse à 18h, évacuation des bassins à 18h30).</p>`;

describe("parseLeguevinPage", () => {
  it("date le bloc par la plage de la phrase, pour fermer hors saison", () => {
    const page = parseLeguevinPage(html);
    expect(page.sections).toHaveLength(1);
    expect(page.sections[0].title).toBe("Horaires du 4 juillet 2026 au 30 août 2026");
  });

  it("écarte la parenthèse de la caisse, dont les heures parasiteraient la grille", () => {
    const rule = parseLeguevinPage(html).sections[0].lines[0].text;
    expect(rule).not.toMatch(/caisse|18h/);
    expect(rule).toMatch(/13h00 à 19h00/);
    expect(rule).toMatch(/tous les jours/);
  });

  it("porte le numéro de la piscine, que la page ne publie pas", () => {
    expect(parseLeguevinPage(html).phone).toBe("0561866212");
  });

  it("ne rend rien sans la phrase d'ouverture", () => {
    expect(parseLeguevinPage("<p>Tarifs 2026</p>").sections).toHaveLength(0);
  });
});
