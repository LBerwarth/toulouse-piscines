import { fetchHtml } from "./http";
import { parseWeekMatrixPage } from "./week-matrix";
import type { PageSections } from "../scrape";

/** Espace nautique Jean-Vauchère (Colomiers) — site dédié, grille période × jour. */
export async function fetchColomiersPage(
  url: string,
  opts?: { fresh?: boolean }
): Promise<PageSections> {
  // Sans encarts d'alerte : `.ce-bodytext p` ramasse aussi la grille de l'école
  // de natation, dont les libellés (« Fermeture de 14h15 à 15h15 ») passeraient
  // pour des fermetures exceptionnelles. À reprendre avec un sélecteur ciblé.
  const page = parseWeekMatrixPage(await fetchHtml(url, opts));
  if (page.sections.length === 0) {
    throw new Error(`Aucune grille d'horaires sur ${url}`);
  }
  return page;
}
