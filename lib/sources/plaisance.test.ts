import { describe, expect, it } from "vitest";
import { parsePlaisancePage } from "./plaisance";

// Structure réelle de la fiche annuaire : un <li> à l'icône horloge porte les
// trois lignes, séparées par des <br> ; le lien tel: a un href vide.
const html = `
  <aside><ul>
    <li><a href="tel:">05 61 06 09 05</a></li>
    <li><span class="icon"></span>
      Du mardi 26 mai au vendredi 31 août : 13h à 19h<br />
      En période scolaire : uniquement le samedi<br />
      Vacances scolaires : tous les jours, sauf le mardi
    </li>
  </ul></aside>
  <a href="tel:+33562135252" title="Téléphoner">Standard</a>`;

describe("parsePlaisancePage", () => {
  it("fait deux sections datées, une par grille scolaire / vacances", () => {
    const page = parsePlaisancePage(html);
    expect(page.sections.map((s) => s.title)).toEqual([
      "Horaires en période scolaire (Du mardi 26 mai au vendredi 31 août)",
      "Horaires vacances scolaires (Du mardi 26 mai au vendredi 31 août)",
    ]);
    expect(page.sections[0].lines).toEqual([
      { kind: "text", text: "uniquement le samedi, de 13h à 19h" },
    ]);
    expect(page.sections[1].lines).toEqual([
      { kind: "text", text: "tous les jours, sauf le mardi, de 13h à 19h" },
    ]);
  });

  it("prend le numéro écrit dans le texte du lien tel: à href vide", () => {
    expect(parsePlaisancePage(html).phone).toBe("0561060905");
  });

  it("retombe sur une grille unique si l'arbitrage scolaire disparaît", () => {
    const simple = `<ul><li><span></span>Du 26 mai au 31 août : 13h à 19h</li></ul>`;
    // Sans « scolaire » le <li> n'est plus reconnu : aucune section, l'adaptateur
    // lèvera — le rapport retombe sur le dernier bon cache plutôt que d'inventer.
    expect(parsePlaisancePage(simple).sections).toHaveLength(0);
  });
});
