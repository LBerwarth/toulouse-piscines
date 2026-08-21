import * as cheerio from "cheerio";
import { fetchHtml } from "./http";
import type { PageSections, SectionLine } from "../scrape";

const DAY_LABELS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const HOME_URL = "https://www.loasisdelaramee.fr/";

/**
 * Piscine intercommunale de l'Oasis de la Ramée (Tournefeuille). Deux requêtes,
 * faute de mieux : la grille est sur la page « horaires », mais la pause
 * technique annuelle (plus d'un mois de fermeture) n'est annoncée que dans le
 * bandeau de l'accueil. Sans elle, la grille scolaire ferait paraître la piscine
 * ouverte tout l'été.
 */
export async function fetchOasisPage(
  url: string,
  opts?: { fresh?: boolean }
): Promise<PageSections> {
  // Séquentiel, pas en parallèle : le serveur coupe la connexion (ECONNRESET)
  // quand les deux pages sont demandées en même temps.
  const schedule = await fetchHtml(url, opts);
  // Bandeau facultatif : sans lui la grille reste lisible, et l'arbitrage
  // scolaire/vacances signale de lui-même une confiance faible.
  const home = await fetchHtml(HOME_URL, opts).catch(() => null);
  const page = parseOasisPage(schedule, home);
  if (page.sections.length === 0) {
    throw new Error(`Aucune grille d'horaires sur ${url}`);
  }
  return page;
}

export function parseOasisPage(scheduleHtml: string, homeHtml: string | null): PageSections {
  const $ = cheerio.load(scheduleHtml);
  $("script, style").remove();
  $("br").replaceWith("\n");

  const sections: PageSections["sections"] = [];
  for (const el of $("#page-horaires .tableau").toArray()) {
    const block = $(el);
    const title = clean(block.children("h3").first().text());
    const basin = clean(block.find(".bassin").first().text());
    const lines: SectionLine[] = [];

    // Grille d'un bassin secondaire (« Disponibilités du Petit bassin ») : pas
    // de titre de période, elle complète la grille qui précède. L'étiquette
    // devient une ligne de bassin, comme sur les pages de Toulouse.
    if (!title && basin) lines.push({ kind: "text", text: basin });

    for (const item of block.find("li").toArray()) {
      const label = clean($(item).find("h4").first().text());
      // Un vrai saut de ligne suit chaque <br> dans la source : sans regrouper
      // les sauts consécutifs, chaque créneau serait précédé de deux « et ».
      const value = clean(
        $(item)
          .find(".fromrte")
          .first()
          .text()
          .replace(/[^\S\n]*\n[^\S\n]*/g, "\n")
          .replace(/\n+/g, " et ")
      );
      if (!value) continue;
      if (DAY_LABELS.some((d) => norm(label).startsWith(d))) {
        lines.push({ kind: "text", text: `${label} : ${value}` });
      } else {
        // En-tête qui n'est pas un jour (« Juillet », « Août ») : chaque
        // paragraphe porte déjà sa règle en prose, jour et heures compris
        // (« Lundi au vendredi : 12h - 19h ») — il faut donc les garder sur une
        // seule ligne, sinon le jour et l'horaire ne s'apparient plus.
        if (label) lines.push({ kind: "heading", text: label });
        for (const para of $(item).find(".fromrte p").toArray()) {
          const rule = clean($(para).text());
          if (rule) lines.push({ kind: "text", text: rule });
        }
      }
    }

    if (lines.length === 0) continue;
    if (!title && sections.length > 0) {
      sections[sections.length - 1].lines.push(...lines);
      continue;
    }
    sections.push({
      title: title || "Horaires d'ouverture",
      body: lines.map((l) => l.text).join("\n"),
      lines,
    });
  }

  for (const section of sections) {
    section.body = section.lines.map((l) => l.text).join("\n");
  }

  return {
    intro: homeHtml ? closureFromBanner(cheerio.load(homeHtml)("#home-alerte").text()) : "",
    sections,
    notices: [],
    shorts: [],
    phone: null,
  };
}

/**
 * La piscine annonce sa fermeture d'un mois comme une « pause technique », que
 * findStrongClosure ne reconnaît pas. On la réécrit dans son vocabulaire plutôt
 * que d'élargir STRONG_CLOSURE_RE : là-bas, un motif sans date de fin fermerait
 * une piscine indéfiniment. Ici les dates encadrent la fermeture.
 */
function closureFromBanner(text: string): string {
  // Le bandeau garde son titre « PISCINE OUVERTE » au-dessus de l'annonce de
  // pause : on part de « Pause technique », sinon la raison affichée
  // s'annoncerait ouverte et fermée dans la même phrase.
  const banner = clean(text);
  const start = banner.search(/pause technique/i);
  if (start === -1) return banner;
  return banner
    .slice(start)
    .replace(/^pause technique\s+(du\s[^.!]*)/i, "Piscine fermée pour pause technique $1");
}
