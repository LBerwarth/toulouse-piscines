import * as cheerio from "cheerio";
import { fetchHtml } from "./http";
import type { PageSections, SectionLine } from "../scrape";

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Piscine municipale de Balma. La mairie met sa grille dans une fiche contact,
 * en texte brut séparé par des <br>, et annonce ses fermetures pour travaux
 * dans un paragraphe à part.
 *
 * Limite connue : les horaires de septembre ne sont publiés qu'en image
 * (HorairesPISCINE_sept2026_bis.jpg), donc illisibles ici — hors des périodes
 * datées ci-dessous, la piscine sera annoncée fermée.
 */
export async function fetchBalmaPage(
  url: string,
  opts?: { fresh?: boolean }
): Promise<PageSections> {
  const page = parseBalmaPage(await fetchHtml(url, opts));
  if (page.sections.length === 0) {
    throw new Error(`Aucune grille d'horaires sur ${url}`);
  }
  return page;
}

export function parseBalmaPage(html: string): PageSections {
  const $ = cheerio.load(html);
  $("script, style").remove();
  $("br").replaceWith("\n");

  const card = $(".contact-card")
    .toArray()
    .find((el) => /horaires d.ouverture/i.test(clean($(el).find("h2").first().text())));

  const sections: PageSections["sections"] = [];
  if (card) {
    const block = $(card).clone();
    block.find("h2").remove();
    // Découper AVANT de nettoyer : clean() écrase les sauts de ligne, or ils
    // sont ici la seule frontière entre les règles (la mairie n'a que des <br>).
    const rows = block
      .text()
      .split("\n")
      .map((r) => clean(r).replace(/^[-–]\s*/, ""))
      .filter((r) => r.length > 0);
    const [period, ...rules] = rows;
    const lines: SectionLine[] = rules.map((text) => ({ kind: "text", text }));
    if (lines.length > 0) {
      // Une même grille peut couvrir deux périodes (« du 30 juin au 1er août ET
      // du 25 août au 29 août ») : parseDateRange n'en lit qu'une, d'où une
      // section par plage — sinon la seconde période paraîtrait fermée.
      for (const range of splitRanges(period ?? "")) {
        const label = `${range.charAt(0).toLowerCase()}${range.slice(1)}`;
        sections.push({ title: `Horaires ${label}`, body: rules.join("\n"), lines });
      }
    }
  }

  // Seuls les paragraphes parlant de fermeture : les autres racontent les
  // travaux de rénovation de 2022 et n'ont rien à dire sur aujourd'hui.
  const notices = $(".bloc-content--paragraph p")
    .toArray()
    .map((el) => clean($(el).text()))
    .filter((t) => t.length > 0 && t.length < 400 && /ferm/i.test(t));

  return {
    intro: "",
    sections,
    notices,
    shorts: [],
    phone: poolPhone($),
  };
}

/**
 * Le premier lien « tel: » de la page est le standard de la mairie : on prend
 * celui qui accompagne l'adresse électronique de la piscine.
 */
function poolPhone($: cheerio.CheerioAPI): string | null {
  const near = $('a[href^="tel:"]')
    .toArray()
    .find((el) => /piscine@/i.test($(el).parent().text()));
  return firstPhone($(near ?? $('a[href^="tel:"]').first()).attr("href") ?? "");
}

/** « du A au B et du C au D : » → [« du A au B », « du C au D »] */
function splitRanges(period: string): string[] {
  const text = period.replace(/\s*:\s*$/, "");
  const ranges = text.match(/du\s.+?(?=\set\sdu\s|$)/gi);
  return ranges && ranges.length > 0 ? ranges.map(clean) : [text || "d'ouverture"];
}

function firstPhone(href: string): string | null {
  const digits = href.replace(/\D/g, "").replace(/^33/, "0");
  return /^0[1-9]\d{8}$/.test(digits) ? digits : null;
}
