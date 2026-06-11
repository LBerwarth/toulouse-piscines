import * as cheerio from "cheerio";

export interface SectionLine {
  /** "heading" = sous-titre (h3-h6, ex. « Du 5 juin au 5 juillet »), "text" = contenu */
  kind: "heading" | "text";
  text: string;
}

export interface PageSections {
  /** Texte d'introduction (chapeau) — contient les avis de travaux / fermetures exceptionnelles */
  intro: string;
  /** Sections d'horaires (accordéons ou blocs « texte encadré »), avec leur titre */
  sections: { title: string; body: string; lines: SectionLine[] }[];
  /** Autres encarts d'alerte trouvés dans la page */
  notices: string[];
}

const REVALIDATE_SECONDS = 1800;

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchPoolPage(url: string): Promise<PageSections> {
  const res = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: { "User-Agent": "toulouse-piscines (projet personnel)" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en récupérant ${url}`);
  }
  return parsePoolPage(await res.text());
}

export function parsePoolPage(html: string): PageSections {
  const $ = cheerio.load(html);

  /**
   * Extrait les lignes structurées d'un conteneur : les h3-h6 deviennent des
   * sous-titres, les p/li du contenu. Les <br> (déjà convertis en \n)
   * séparent de vraies lignes.
   */
  const extractLines = (container: ReturnType<typeof $>, skipNode?: unknown): SectionLine[] => {
    const lines: SectionLine[] = [];
    container.find("h2, h3, h4, h5, h6, p, li, tr").each((_, node) => {
      if (skipNode && node === skipNode) return;
      const $n = $(node);
      // Évite les doublons : un <p> dans un <li> est couvert par le <li>,
      // un <li> contenant d'autres <li> est couvert par ses enfants, et le
      // contenu des tableaux est couvert par les <tr>.
      if ($n.parents("li, p").length > 0) return;
      if (node.tagName !== "tr" && $n.parents("table").length > 0) return;
      if ((node.tagName === "li" || node.tagName === "p") && $n.find("li").length > 0) return;

      // Lignes de tableau (ex. tarifs) : cellules séparées par « · »
      if (node.tagName === "tr") {
        const cells = $n
          .find("th, td")
          .toArray()
          .map((cell) => clean($(cell).text()))
          .filter(Boolean);
        if (cells.length > 0) {
          lines.push({ kind: "text", text: cells.join(" · ").slice(0, 500) });
        }
        return;
      }

      const kind = /^h\d$/i.test(node.tagName) ? ("heading" as const) : ("text" as const);
      for (const piece of $n.text().split("\n")) {
        const text = clean(piece);
        if (!text) continue;
        lines.push({ kind, text: text.slice(0, 500) });
      }
    });
    return lines;
  };

  // La mairie sépare souvent les jours par des <br> dans un seul paragraphe
  // (« Lundi : 12h - 14h<br>Mardi : fermé… ») : on en fait de vraies lignes.
  $("br").replaceWith("\n");

  const intro = clean($(".field--name-field-chapeau").text());

  const sections: { title: string; body: string; lines: SectionLine[] }[] = [];

  // 1. Sections accordéon (« Horaires période scolaire », …)
  $(".accordion-item").each((_, el) => {
    const item = $(el);
    const title = clean(item.find(".accordion-button__text").first().text());
    const bodyEl = item.find(".accordion-body");
    const body = clean(bodyEl.text());
    if (!title || !body) return;
    // L'accordéon « Tous les horaires à télécharger » ne contient qu'un PDF
    if (/horaires à télécharger/i.test(title)) return;
    sections.push({ title, body: body.slice(0, 4000), lines: extractLines(bodyEl) });
  });

  // 2. Blocs « texte encadré » hors accordéon : certaines pages (piscines
  // d'été notamment) y publient les horaires sous un titre <h3>Horaires…
  // Les blocs sans titre d'horaires restent des encarts d'alerte.
  const notices: string[] = [];
  $(".paragraph--type--texte-encadre").each((_, el) => {
    const block = $(el);
    if (block.parents(".accordion-item").length > 0) return;
    const text = clean(block.text());
    if (!text || text.length <= 10) return;

    const titleEl = block
      .find("h2, h3")
      .filter((_, h) => /horaire/i.test($(h).text()))
      .first();
    if (titleEl.length > 0) {
      sections.push({
        title: clean(titleEl.text()),
        body: text.slice(0, 4000),
        lines: extractLines(block, titleEl.get(0)),
      });
    } else {
      notices.push(text.slice(0, 1500));
    }
  });

  return { intro, sections, notices };
}
