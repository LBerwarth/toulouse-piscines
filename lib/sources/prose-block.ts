import * as cheerio from "cheerio";
import type { PageSections, SectionLine } from "../scrape";

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export interface ProseSiteConfig {
  /** Blocs candidats de la page (un par rubrique éditoriale). */
  blockSelector: string;
  /** Titre du bloc à retenir, cherché parmi `h1`-`h3`. */
  blockTitle: RegExp;
}

const HEADINGS = "h2, h3, h4, h5, h6";
const CONTENT = `${HEADINGS}, p, li`;

/**
 * Page dont les horaires sont rédigés en prose, dans la même langue que le site
 * de la mairie de Toulouse (« Du lundi au vendredi : 11h45 à 18h45 », étiquettes
 * de bassin en intertitre). Aucune conversion n'est donc nécessaire : il suffit
 * d'isoler le bon bloc, sans quoi on ramasserait les horaires des cours
 * d'aquagym ou ceux de la mairie elle-même.
 */
export function parseProseBlockPage(html: string, config: ProseSiteConfig): PageSections {
  const $ = cheerio.load(html);
  $("script, style, nav, footer").remove();
  $("br").replaceWith("\n");

  const block = $(config.blockSelector)
    .toArray()
    .find((el) => config.blockTitle.test(clean($(el).find("h1, h2, h3").first().text())));

  const sections: PageSections["sections"] = [];
  if (block) {
    const nodes = $(block)
      .find(CONTENT)
      .toArray()
      // Un <p> ou <li> qui contient lui-même une liste serait compté deux fois.
      .filter((el) => $(el).find("li").length === 0);

    let title: string | null = null;
    const lines: SectionLine[] = [];
    for (const el of nodes) {
      const text = clean($(el).text());
      if (!text) continue;
      const isHeading = $(el).is(HEADINGS);
      // Le titre du bloc (« HORAIRES ») n'est pas une ligne d'horaires.
      if (isHeading && title === null && config.blockTitle.test(text)) continue;
      if (isHeading && title === null) {
        title = text;
        continue;
      }
      lines.push({ kind: isHeading ? "heading" : "text", text });
    }

    if (lines.length > 0) {
      // buildBlocks ne retient une section que si son titre parle d'horaires,
      // d'ouverture ou de période — d'où le préfixe quand la mairie titre sa
      // grille par la seule période (« Jusqu'au 6 septembre 2026 »).
      const label = title ?? "Horaires";
      const heading = /horaire|ouverture|periode/.test(norm(label))
        ? label
        : `Horaires ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
      sections.push({ title: heading, body: lines.map((l) => l.text).join("\n"), lines });
    }
  }

  return {
    intro: "",
    sections,
    notices: [],
    shorts: [],
    phone: firstPhone($('a[href^="tel:"]').first().attr("href") ?? ""),
  };
}

function firstPhone(href: string): string | null {
  const digits = href.replace(/\D/g, "").replace(/^33/, "0");
  return /^0[1-9]\d{8}$/.test(digits) ? digits : null;
}
