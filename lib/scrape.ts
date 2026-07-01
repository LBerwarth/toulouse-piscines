import * as cheerio from "cheerio";

export interface SectionLine {
  /** "heading" = sous-titre (h3-h6, ex. « Du 5 juin au 5 juillet »), "text" = contenu */
  kind: "heading" | "text";
  text: string;
}

/** Actualité du bloc « En bref » (canicule, fermetures, extensions d'horaires…) */
export interface ShortNews {
  /** Date de publication (attribut datetime, ex. « 2026-06-18 ») ou null */
  date: string | null;
  /** Titre de l'actualité (h3) */
  title: string;
  /** Texte complet, pour en extraire la période d'application */
  text: string;
  /**
   * Piscines explicitement citées par un lien /annuaire/<slug>, avec le texte
   * qui suit le lien (« : ouverture jusqu'à 20h ») d'où l'on tire l'horaire.
   */
  pools: { slug: string; after: string }[];
}

export interface PageSections {
  /** Texte d'introduction (chapeau) — contient les avis de travaux / fermetures exceptionnelles */
  intro: string;
  /** Sections d'horaires (accordéons ou blocs « texte encadré »), avec leur titre */
  sections: { title: string; body: string; lines: SectionLine[] }[];
  /** Autres encarts d'alerte trouvés dans la page */
  notices: string[];
  /** Actualités « En bref » — la mairie y publie les annonces opérationnelles (hors grille d'horaires) */
  shorts: ShortNews[];
}

const REVALIDATE_SECONDS = 1800;

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Récupère et analyse une page piscine.
 * @param opts.fresh force une requête réseau (sans le Data Cache de Next) —
 *   utilisé quand on rafraîchit volontairement le cache applicatif (cf. status.ts).
 */
export async function fetchPoolPage(url: string, opts?: { fresh?: boolean }): Promise<PageSections> {
  const res = await fetch(url, {
    // On ne peut pas combiner `cache` et `next.revalidate` : soit on force le
    // réseau, soit on s'appuie sur le Data Cache (30 min).
    ...(opts?.fresh ? { cache: "no-store" as const } : { next: { revalidate: REVALIDATE_SECONDS } }),
    // En-têtes proches d'un navigateur : depuis les IP datacenter de Vercel, la
    // source (Varnish + protection en façade) renvoyait sinon une page vide en
    // HTTP 200 à notre ancien User-Agent « bot », d'où des rescans à zéro
    // horaire pris à tort pour une maintenance. Accès légitime à des données
    // publiques pour une appli gratuite et non commerciale.
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en récupérant ${url}`);
  }
  const page = parsePoolPage(await res.text());
  // La mairie sert sa page de maintenance avec un HTTP 200 (« Site en
  // maintenance », sans aucune grille). Une refonte qui casserait le parseur
  // produirait le même vide. Dans les deux cas la page n'a rien d'exploitable :
  // on lève plutôt que de renvoyer un horaire vide — ainsi le rapport retombe
  // sur le dernier bon cache (cf. status.ts) au lieu de l'écraser par du vide,
  // et le cron n'émet pas de fausses notifications de fermeture.
  if (page.sections.length === 0) {
    throw new Error(`Aucune section d'horaires sur ${url} (page de maintenance ?)`);
  }
  return page;
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

  /**
   * Texte d'un conteneur en préservant les sauts de ligne entre blocs (p / li /
   * <br>). Contrairement à un simple .text() qui collerait « …19 juin :Tarif »,
   * on insère un \n après chaque bloc puis on normalise les espaces sans toucher
   * aux retours à la ligne. On clone pour ne pas altérer l'arbre (réutilisé
   * ensuite pour extraire les liens /annuaire/).
   */
  const blockText = (el: ReturnType<typeof $>): string => {
    const clone = el.clone();
    clone.find("p, li").append("\n");
    return clone
      .text()
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
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

  // 3. Bloc « En bref » : actualités opérationnelles (canicule, fermetures,
  // extensions d'horaires…). La mairie les publie ici, hors de la grille — le
  // même bloc apparaît à l'identique sur toutes les pages piscines.
  const shorts: ShortNews[] = [];
  $(".block__shorts__list-item").each((_, el) => {
    const item = $(el);
    const date = item.find("time").first().attr("datetime") ?? null;
    const title = clean(item.find(".title h3, h3").first().text());
    // Corps de l'actu en préservant les sauts de ligne (sinon les blocs se
    // collent : « …19 juin :Tarif unique… », « …20h30Ces dispositions… »).
    const bodyEl = item.find(".text-formatted").first();
    const text = bodyEl.length > 0 ? blockText(bodyEl) : clean(item.text());
    if (!title && !text) return;

    const pools: { slug: string; after: string }[] = [];
    item.find("a[href*='/annuaire/']").each((__, a) => {
      const slug = ($(a).attr("href") ?? "").match(/\/annuaire\/([a-z0-9-]+)/)?.[1];
      if (!slug || pools.some((p) => p.slug === slug)) return;
      // Texte qui suit le lien jusqu'au lien suivant (« : ouverture jusqu'à 20h »).
      // On parcourt les nœuds frères bruts pour capter aussi les nœuds texte.
      let after = "";
      for (let n = a.next; n; n = n.next) {
        if (n.type === "tag" && n.name === "a") break;
        after += $(n).text();
      }
      pools.push({ slug, after: clean(after) });
    });

    shorts.push({ date, title, text: text.slice(0, 1500), pools });
  });

  return { intro, sections, notices, shorts };
}
