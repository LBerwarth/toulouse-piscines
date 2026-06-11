import { describe, expect, it } from "vitest";
import { parsePoolPage } from "./scrape";

describe("parsePoolPage", () => {
  it("lit les horaires d'un bloc « texte encadré » hors accordéon (piscines d'été)", () => {
    // Structure réelle de la page Alfred Nakache été
    const html = `
      <html><body>
        <div class="paragraph paragraph--type--texte-encadre">
          <div class="field field--name-field-texte-encadre">
            <h3>Horaires à partir du 5 juin 2026</h3>
            <p><strong>Fermeture des caisses 1h avant l'heure de fermeture de la piscine.</strong><br>
            <strong>Évacuation du bassin et des plages 30 minutes avant l'heure de fermeture.</strong></p>
            <h4>Du 5 juin au 5 juillet</h4>
            <ul><li>Du lundi au vendredi de 12h à 19h</li><li>Samedi et dimanche de 9h30 à 20h30</li></ul>
            <h4>Du 6 juillet au 23 août</h4>
            <ul><li>De 10h à 20h30</li></ul>
          </div>
        </div>
        <div class="paragraph paragraph--type--texte-encadre">
          <p>Lors d'événements au Stadium, l'accès est modifié.</p>
        </div>
      </body></html>`;

    const result = parsePoolPage(html);

    expect(result.sections).toHaveLength(1);
    const section = result.sections[0];
    expect(section.title).toBe("Horaires à partir du 5 juin 2026");
    // Le titre h3 ne doit pas réapparaître dans les lignes
    expect(section.lines.some((l) => /Horaires à partir/.test(l.text))).toBe(false);
    expect(section.lines).toContainEqual({ kind: "heading", text: "Du 5 juin au 5 juillet" });
    expect(section.lines).toContainEqual({
      kind: "text",
      text: "Du lundi au vendredi de 12h à 19h",
    });
    // Le bloc sans titre d'horaires reste un encart
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatch(/Stadium/);
  });

  it("lit les tableaux (tarifs) ligne par ligne, cellules séparées par « · »", () => {
    const html = `
      <html><body>
        <div class="accordion-item">
          <button class="accordion-button"><span class="accordion-button__text">Horaires et tarifs</span></button>
          <div class="accordion-body">
            <table>
              <tr><th>Tarifs</th><th>Toulousains</th><th>Non Toulousains</th></tr>
              <tr><td><p>Entrée tarif normal</p></td><td>3.40 €</td><td>4.40 €</td></tr>
            </table>
          </div>
        </div>
      </body></html>`;

    const result = parsePoolPage(html);
    expect(result.sections[0].lines).toEqual([
      { kind: "text", text: "Tarifs · Toulousains · Non Toulousains" },
      { kind: "text", text: "Entrée tarif normal · 3.40 € · 4.40 €" },
    ]);
  });

  it("sépare les jours collés par des <br> dans un même paragraphe", () => {
    const html = `
      <html><body>
        <div class="accordion-item">
          <button class="accordion-button"><span class="accordion-button__text">Horaires en période scolaire</span></button>
          <div class="accordion-body">
            <p>Lundi : 12h - 14h<br>Mardi : fermé<br>Jeudi : 16h - 19h</p>
          </div>
        </div>
      </body></html>`;

    const result = parsePoolPage(html);
    expect(result.sections[0].lines).toEqual([
      { kind: "text", text: "Lundi : 12h - 14h" },
      { kind: "text", text: "Mardi : fermé" },
      { kind: "text", text: "Jeudi : 16h - 19h" },
    ]);
  });
});
