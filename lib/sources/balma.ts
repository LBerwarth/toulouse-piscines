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

  // Grille de rentrée : la mairie ne la publie qu'en IMAGE
  // (HorairesPISCINE_sept2026_bis.jpg), illisible au scrape — relevée à la
  // main sur l'affiche le 22/08/2026. Les grilles d'été de la page (datées,
  // bornées) gardent la priorité tant qu'elles couvrent le jour ; ces deux
  // blocs ouverts se départagent ensuite par le calendrier scolaire.
  for (const grid of SEPTEMBER_GRIDS) {
    sections.push({
      title: grid.title,
      body: grid.rules.join("\n"),
      lines: grid.rules.map((text) => ({ kind: "text" as const, text })),
    });
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

/** Grille annuelle relevée sur l'affiche de la mairie (voir parseBalmaPage). */
const SEPTEMBER_GRIDS: { title: string; rules: string[] }[] = [
  {
    title: "Horaires en période scolaire (à partir du 30 août 2026)",
    rules: [
      "Lundi : 12h00 - 13h30 et 17h00 - 19h30",
      "Mardi : 17h00 - 19h30",
      "Mercredi : 12h00 - 13h30",
      "Jeudi : 17h00 - 19h30",
      "Vendredi : 12h00 - 13h30",
      "Samedi : 9h00 - 12h00 et 13h30 - 18h00",
      "Dimanche : fermé",
    ],
  },
  {
    title: "Horaires vacances scolaires (à partir du 30 août 2026)",
    rules: [
      "Lundi : fermé",
      "Mardi : 12h00 - 19h00",
      "Mercredi : 12h00 - 19h00",
      "Jeudi : 12h00 - 19h00",
      "Vendredi : 12h00 - 19h00",
      "Samedi : 10h00 - 18h00",
      "Dimanche : fermé",
    ],
  },
];
