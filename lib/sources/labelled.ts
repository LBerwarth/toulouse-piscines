import * as cheerio from "cheerio";
import type { PageSections } from "../scrape";

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

export interface LabelledSiteConfig {
  /** Bloc de contenu éditorial de la page. */
  blockSelector: string;
  /** Intitulé précédant la période d'ouverture de la saison. */
  seasonLabel: RegExp;
  /** Intitulé précédant la grille horaire. */
  hoursLabel: RegExp;
}

/**
 * Page en « intitulé puis valeur » : la mairie annonce « Dates d'ouverture »
 * dans un intertitre et met la réponse dans le paragraphe suivant. La période
 * doit remonter dans le TITRE de section, sinon buildBlocks n'en fait pas un
 * bloc daté et la piscine paraîtrait ouverte hors saison.
 */
export function parseLabelledPage(html: string, config: LabelledSiteConfig): PageSections {
  const $ = cheerio.load(html);
  $("script, style, nav, footer").remove();
  $("br").replaceWith("\n");

  const nodes = $(config.blockSelector).first().find("p, li, h2, h3, h4, h5, h6").toArray();
  const texts = nodes.map((el) => clean($(el).text())).filter((t) => t.length > 0);

  /** Premier texte suivant l'intitulé — la valeur cherchée. */
  const valueAfter = (label: RegExp): string | null => {
    const i = texts.findIndex((t) => label.test(t));
    return i === -1 ? null : (texts[i + 1] ?? null);
  };

  const season = valueAfter(config.seasonLabel);
  const hours = valueAfter(config.hoursLabel);

  const sections: PageSections["sections"] = [];
  if (hours) {
    const title = season ? `Horaires ${season.replace(/\s*:\s*$/, "")}` : "Horaires d'ouverture";
    sections.push({ title, body: hours, lines: [{ kind: "text", text: hours }] });
  }

  return {
    intro: "",
    sections,
    notices: [],
    shorts: [],
    phone: firstPhone(texts.join(" ")),
  };
}

/** La mairie écrit son numéro en clair, sans lien « tel: ». */
function firstPhone(text: string): string | null {
  const match = text.match(/0[1-9](?:[ .-]?\d{2}){4}/);
  return match ? match[0].replace(/\D/g, "") : null;
}
