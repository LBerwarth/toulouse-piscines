import * as cheerio from "cheerio";
import { fetchHtml } from "./http";
import type { PageSections } from "../scrape";

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Piscine municipale de Plaisance-du-Touch. Toute l'information tient dans un
 * seul <li> de la fiche annuaire, en trois lignes : la saison avec les heures,
 * puis l'arbitrage scolaire (« uniquement le samedi ») / vacances (« tous les
 * jours, sauf le mardi »). On en fait deux sections datées, une par grille —
 * analyzeDay les départage ensuite par le calendrier scolaire.
 */
export async function fetchPlaisancePage(
  url: string,
  opts?: { fresh?: boolean }
): Promise<PageSections> {
  const page = parsePlaisancePage(await fetchHtml(url, opts));
  if (page.sections.length === 0) {
    throw new Error(`Aucun horaire d'ouverture sur ${url}`);
  }
  return page;
}

export function parsePlaisancePage(html: string): PageSections {
  const $ = cheerio.load(html);
  $("script, style").remove();
  $("br").replaceWith("\n");

  // Le <li> à l'icône horloge : seule zone de la page qui porte à la fois des
  // heures et la distinction scolaire / vacances.
  const li = $("li")
    .toArray()
    .find((el) => {
      const t = clean($(el).text());
      return /\d{1,2}\s*h/.test(t) && /scolaire/i.test(t);
    });

  const sections: PageSections["sections"] = [];
  if (li) {
    const rows = $(li)
      .text()
      .split("\n")
      .map(clean)
      .filter((r) => r.length > 0);
    // « Du mardi 26 mai au vendredi 31 août : 13h à 19h » → saison + heures
    const seasonRow = rows.find((r) => /:\s*\d{1,2}\s*h/.test(r));
    const m = seasonRow?.match(/^(.+?)\s*:\s*(\d{1,2}\s*h.*)$/) ?? null;
    const season = m?.[1] ?? null;
    const times = m?.[2] ?? null;
    const afterColon = (re: RegExp): string | null => {
      const row = rows.find((r) => re.test(r));
      const i = row?.indexOf(":") ?? -1;
      return row && i >= 0 ? clean(row.slice(i + 1)) : null;
    };
    const school = afterColon(/p[ée]riode scolaire/i);
    const vacation = afterColon(/vacances scolaires/i);

    const push = (title: string, rule: string) =>
      sections.push({ title, body: rule, lines: [{ kind: "text", text: rule }] });

    if (times && season && school && vacation) {
      push(`Horaires en période scolaire (${season})`, `${school}, de ${times}`);
      push(`Horaires vacances scolaires (${season})`, `${vacation}, de ${times}`);
    } else if (times) {
      // Repli si la mairie simplifie sa fiche : une seule grille, datée si possible.
      push(`Horaires ${season ?? "d'ouverture"}`, `de ${times}`);
    }
  }

  return {
    intro: "",
    sections,
    notices: [],
    shorts: [],
    // Le lien « tel: » de la fiche a un href VIDE (le numéro est dans le
    // texte), et d'autres liens tel: traînent ailleurs sur la page : on prend
    // le premier dont le texte porte un numéro bien formé.
    phone:
      $('a[href^="tel:"]')
        .toArray()
        .map((el) => firstPhone($(el).text()))
        .find((p) => p !== null) ?? null,
  };
}

function firstPhone(text: string): string | null {
  const match = clean(text).match(/0[1-9](?:[ .-]?\d{2}){4}/);
  return match ? match[0].replace(/\D/g, "") : null;
}
