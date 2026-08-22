import * as cheerio from "cheerio";
import { fetchHtml } from "./http";
import type { PageSections } from "../scrape";

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Piscine d'été de Léguevin. Une seule phrase fait foi : « La piscine
 * municipale sera ouverte au public de 13h00 à 19h00, tous les jours du
 * 4 juillet 2026 au 30 août 2026 (…) ». La plage de dates remonte dans le
 * titre de section pour que le bloc soit daté — hors saison, fermeture sûre.
 */
export async function fetchLeguevinPage(
  url: string,
  opts?: { fresh?: boolean }
): Promise<PageSections> {
  const page = parseLeguevinPage(await fetchHtml(url, opts));
  if (page.sections.length === 0) {
    throw new Error(`Aucun horaire d'ouverture sur ${url}`);
  }
  return page;
}

export function parseLeguevinPage(html: string): PageSections {
  const $ = cheerio.load(html);
  $("script, style, head").remove();

  const sentence = $("p")
    .toArray()
    .map((el) => clean($(el).text()))
    .find((t) => /ouverte au public/i.test(t) && /\d{1,2}\s*h/.test(t));

  const sections: PageSections["sections"] = [];
  if (sentence) {
    // La parenthèse (« fermeture de la caisse à 18h… ») cite d'autres heures :
    // on l'écarte pour ne pas risquer de les lire comme un second créneau.
    const rule = clean(sentence.replace(/\([^)]*\)/g, ""));
    const range = rule.match(/du\s+\d{1,2}\s?\S+\s?\d{0,4}\s+au\s+\d{1,2}\s?\S+\s?\d{0,4}/i);
    sections.push({
      title: range ? `Horaires ${range[0]}` : "Horaires d'ouverture",
      body: rule,
      lines: [{ kind: "text", text: rule }],
    });
  }

  // La page ne publie que le standard de la mairie : numéro de la piscine
  // relevé sur place et figé.
  return { intro: "", sections, notices: [], shorts: [], phone: "0561866212" };
}
