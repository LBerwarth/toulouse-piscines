import * as cheerio from "cheerio";
import type { PageSections, SectionLine } from "../scrape";

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** Index 0-6 du jour nommé par un en-tête de colonne, sinon null. */
function dayIndex(cell: string): number | null {
  const t = norm(cell);
  const i = DAY_LABELS.findIndex((d) => t.includes(norm(d)));
  return i === -1 ? null : i;
}

/**
 * Horaires d'une cellule de grille en prose façon mairie de Toulouse, seule
 * forme que parseTimeRanges sait lire. Les mairies écrivent l'heure de dix
 * façons : « 10h » / « 20h » empilés (Colomiers), « 12.00 19.30 » ou
 * « 13:30 19.30 » (Hersain), « 12.00 13.30 et 17.00 19.00 » pour deux créneaux.
 * Renvoie null si la cellule ne contient aucune heure (« Fermé », « Réservé aux
 * associations ») — l'appelant en fait alors une ligne de fermeture.
 */
export function normalizeCellTimes(cell: string): string | null {
  const groups: string[] = [];
  for (const part of clean(cell).split(/\bet\b|\/|;/i)) {
    // Les minutes doivent être collées au séparateur : dans une cellule
    // « 10h 20h » (ouverture / fermeture empilées), un `\s*` avant les minutes
    // ferait lire « 10h20 » et perdrait l'heure de fermeture.
    const times = [...part.matchAll(/(\d{1,2})\s*(?:h|:|\.)([0-5]\d)?/g)].map((m) =>
      m[2] && m[2] !== "00" ? `${Number(m[1])}h${m[2]}` : `${Number(m[1])}h`
    );
    for (let i = 0; i + 1 < times.length; i += 2) {
      groups.push(`${times[i]} - ${times[i + 1]}`);
    }
  }
  return groups.length > 0 ? groups.join(" et ") : null;
}

interface MatrixTable {
  /** Colonnes de jours : index de colonne → jour 0-6 */
  dayColumns: Map<number, number>;
  rows: string[][];
  headerRow: number;
}

/**
 * Repère dans un tableau la ligne d'en-tête nommant les jours de la semaine.
 * Les mairies la mettent tantôt dans <thead>, tantôt en première <tr> de corps
 * (Colomiers) — on la cherche donc sur le contenu, pas sur la balise. Il faut
 * au moins 5 jours nommés : les tableaux de tarifs ou de créneaux de club ne
 * doivent pas être pris pour une grille hebdomadaire.
 */
function findMatrix(rows: string[][]): MatrixTable | null {
  for (let r = 0; r < rows.length; r++) {
    const dayColumns = new Map<number, number>();
    rows[r].forEach((cell, c) => {
      const day = dayIndex(cell);
      // Première colonne = libellé de période, jamais un jour.
      if (day !== null && c > 0 && !dayColumns.has(c)) dayColumns.set(c, day);
    });
    if (new Set(dayColumns.values()).size >= 5) return { dayColumns, rows, headerRow: r };
  }
  return null;
}

/**
 * Texte d'une cellule. Les blocs empilés dedans (« 10h » puis « 20h » en deux
 * <p>, à Colomiers) doivent être séparés par un espace : cheerio les collerait
 * en « 10h20h », qui ne se lit plus.
 */
function cellText($: cheerio.CheerioAPI, cell: never): string {
  const el = $(cell);
  const blocks = el.children("p, div, li").toArray();
  return clean(blocks.length > 0 ? blocks.map((b) => $(b).text()).join(" ") : el.text());
}

function tableRows($: cheerio.CheerioAPI, table: cheerio.Cheerio<never>): string[][] {
  return $(table)
    .find("tr")
    .toArray()
    .map((tr) =>
      $(tr)
        .find("th, td")
        .toArray()
        .map((cell) => cellText($, cell as never))
    );
}

/**
 * Une section d'horaires par ligne de période (« Période scolaire »,
 * « Vacances d'été »…), avec une ligne par jour. Le titre de section porte la
 * période : c'est lui que analyzeDay arbitre (scolaire / vacances / été).
 *
 * Le préfixe « Horaires » n'est pas cosmétique : buildBlocks ne retient que les
 * sections dont le titre parle d'horaires, d'ouverture ou de période — sans lui,
 * une ligne intitulée « Vacances d'Été » serait ignorée.
 */
function sectionsFromMatrix(m: MatrixTable): PageSections["sections"] {
  const sections: PageSections["sections"] = [];
  for (let r = 0; r < m.rows.length; r++) {
    if (r === m.headerRow) continue;
    const row = m.rows[r];
    const label = clean(row[0] ?? "");
    if (!label) continue;
    const title = /horaire|ouverture|periode/.test(norm(label)) ? label : `Horaires ${label}`;
    const lines: SectionLine[] = [];
    for (const [col, day] of m.dayColumns) {
      const times = normalizeCellTimes(row[col] ?? "");
      lines.push({
        kind: "text",
        text: times ? `${DAY_LABELS[day]} : ${times}` : `${DAY_LABELS[day]} : fermé`,
      });
    }
    if (lines.length > 0) sections.push({ title, body: lines.map((l) => l.text).join("\n"), lines });
  }
  return sections;
}

export interface MatrixSiteConfig {
  /** Blocs de texte à remonter en encarts d'alerte (fermetures annoncées…). */
  noticeSelector?: string;
  /** Bloc d'introduction, s'il y en a un. */
  introSelector?: string;
}

/**
 * Page dont les horaires tiennent dans une grille période × jour. Structure
 * partagée par plusieurs sites de mairie, à quelques sélecteurs près.
 */
export function parseWeekMatrixPage(html: string, config: MatrixSiteConfig = {}): PageSections {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer").remove();

  // Seule la PREMIÈRE grille période × jour est la grille publique : les
  // suivantes sont les créneaux de cours ou de clubs (Colomiers publie une
  // grille « Matin / Après-midi / Soir » de l'école de natation, Hersain deux
  // tableaux de créneaux de club — tous nomment aussi les jours).
  let sections: PageSections["sections"] = [];
  for (const table of $("table").toArray()) {
    const matrix = findMatrix(tableRows($, $(table) as never));
    if (matrix) {
      sections = sectionsFromMatrix(matrix);
      break;
    }
  }

  const notices = config.noticeSelector
    ? $(config.noticeSelector)
        .toArray()
        .map((el) => clean($(el).text()))
        .filter((t) => t.length > 0 && t.length < 600)
    : [];

  return {
    intro: config.introSelector ? clean($(config.introSelector).first().text()) : "",
    sections,
    notices,
    shorts: [],
    phone: firstPhone($('a[href^="tel:"]').first().attr("href") ?? ""),
  };
}

function firstPhone(href: string): string | null {
  const digits = href.replace(/\D/g, "").replace(/^33/, "0");
  return /^0[1-9]\d{8}$/.test(digits) ? digits : null;
}
