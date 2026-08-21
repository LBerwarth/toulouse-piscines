import { describe, expect, it } from "vitest";
import { normalizeCellTimes, parseWeekMatrixPage } from "./week-matrix";

describe("normalizeCellTimes", () => {
  it("apparie l'ouverture et la fermeture empilées dans une même cellule", () => {
    // Colomiers : deux <p> dans la cellule, aplatis en « 10h 20h »
    expect(normalizeCellTimes("10h 20h")).toBe("10h - 20h");
    // Les minutes ne doivent pas être happées depuis l'heure suivante
    expect(normalizeCellTimes("7h 21h30")).toBe("7h - 21h30");
  });

  it("lit les heures écrites avec un point ou deux-points", () => {
    // Hersain : « 12.00 19.30 », et un « 13:30 » qui traîne dans la même grille
    expect(normalizeCellTimes("12.00 19.30")).toBe("12h - 19h30");
    expect(normalizeCellTimes("13:30 19.30")).toBe("13h30 - 19h30");
  });

  it("garde les deux créneaux d'une journée coupée", () => {
    expect(normalizeCellTimes("12.00 13.30 et 17.00 19.00")).toBe("12h - 13h30 et 17h - 19h");
  });

  it("ignore les astérisques de renvoi de note", () => {
    expect(normalizeCellTimes("7h*** 21h30")).toBe("7h - 21h30");
  });

  it("ne renvoie rien quand la cellule ne contient aucune heure", () => {
    expect(normalizeCellTimes("Réservé aux associations")).toBeNull();
    expect(normalizeCellTimes("Fermé")).toBeNull();
    expect(normalizeCellTimes("")).toBeNull();
  });
});

describe("parseWeekMatrixPage", () => {
  // Grille de Colomiers : en-tête de jours en première <tr> (pas de <thead>),
  // ouverture et fermeture en deux <p> par cellule.
  const colomiers = `
    <table>
      <tr>
        <td><strong>Horaires d'ouverture</strong></td>
        <td><p>Lundi</p></td><td><p>Mardi</p></td><td><p>Mercredi</p></td>
        <td><p>Jeudi</p></td><td><p>Vendredi</p></td><td><p>Samedi</p></td>
        <td><p>Dimanche et</p><p>jours fériés</p></td>
      </tr>
      <tr>
        <td><strong>Période scolaire*</strong></td>
        <td><p>10h</p><p>20h</p></td><td><p>7h***</p><p>21h30</p></td>
        <td><p>10h</p><p>20h</p></td><td><p>7h</p><p>21h30</p></td>
        <td><p>10h</p><p>20h</p></td><td><p>12h</p><p>19h</p></td>
        <td><p>9h</p><p>19h</p></td>
      </tr>
    </table>`;

  it("fait une section par période et une ligne par jour", () => {
    const page = parseWeekMatrixPage(colomiers);

    expect(page.sections).toHaveLength(1);
    expect(page.sections[0].title).toBe("Période scolaire*");
    expect(page.sections[0].lines).toContainEqual({ kind: "text", text: "Lundi : 10h - 20h" });
    expect(page.sections[0].lines).toContainEqual({ kind: "text", text: "Mardi : 7h - 21h30" });
    expect(page.sections[0].lines).toContainEqual({ kind: "text", text: "Dimanche : 9h - 19h" });
  });

  it("titre les périodes dans le vocabulaire de buildBlocks", () => {
    // « Vacances d'Été » seul serait ignoré par buildBlocks, qui exige
    // « horaire », « ouverture » ou « periode » dans le titre de section.
    const page = parseWeekMatrixPage(`
      <table>
        <thead><tr><th></th><th>Lundi</th><th>Mardi</th><th>Mercredi</th>
          <th>Jeudi</th><th>Vendredi</th><th>Samedi</th><th>Dimanche</th></tr></thead>
        <tbody><tr><td>Vacances d'Eté</td>
          <td>12.00 19.30</td><td>12.00 19.30</td><td>12.00 19.30</td>
          <td>12.00 19.30</td><td>12.00 19.30</td><td>13:30 19.30</td>
          <td>13:30 19.30</td></tr></tbody>
      </table>`);

    expect(page.sections[0].title).toBe("Horaires Vacances d'Eté");
    expect(page.sections[0].lines).toContainEqual({ kind: "text", text: "Samedi : 13h30 - 19h30" });
  });

  it("marque fermés les jours sans heure", () => {
    const page = parseWeekMatrixPage(`
      <table>
        <tr><td></td><td>Lundi</td><td>Mardi</td><td>Mercredi</td>
          <td>Jeudi</td><td>Vendredi</td><td>Samedi</td><td>Dimanche</td></tr>
        <tr><td>Période scolaire</td>
          <td>12h 14h</td><td>12h 14h</td><td>12h 14h</td><td>12h 14h</td>
          <td>12h 14h</td><td>Réservé aux associations</td><td>Fermé</td></tr>
      </table>`);

    expect(page.sections[0].lines).toContainEqual({ kind: "text", text: "Samedi : fermé" });
    expect(page.sections[0].lines).toContainEqual({ kind: "text", text: "Dimanche : fermé" });
  });

  it("ignore un tableau de tarifs (aucun jour de semaine en en-tête)", () => {
    const page = parseWeekMatrixPage(`
      <table>
        <thead><tr><th></th><th>1 entrée</th><th>12 entrées</th></tr></thead>
        <tbody><tr><td>Plein tarif</td><td>3.40 €</td><td>34.00 €</td></tr></tbody>
      </table>`);

    expect(page.sections).toHaveLength(0);
  });

  it("ne retient que la première grille : les suivantes sont des créneaux de club", () => {
    const page = parseWeekMatrixPage(`
      ${colomiers}
      <table>
        <tr><td></td><td>Lundi</td><td>Mardi</td><td>Mercredi</td>
          <td>Jeudi</td><td>Vendredi</td><td>Samedi</td><td>Dimanche</td></tr>
        <tr><td>Matin</td><td>10h15 11h10</td><td></td><td></td><td></td>
          <td></td><td></td><td></td></tr>
      </table>`);

    expect(page.sections.map((s) => s.title)).toEqual(["Période scolaire*"]);
  });

  it("relève le téléphone de l'accueil quand la page en publie un", () => {
    const page = parseWeekMatrixPage(`
      ${colomiers}
      <a href="tel:+33561153150">Nous appeler</a>`);

    expect(page.phone).toBe("0561153150");
  });
});
