import { fetchHtml } from "./http";
import { parseWeekMatrixPage } from "./week-matrix";
import type { PageSections } from "../scrape";

/**
 * Piscine intercommunale de l'Hersain (Saint-Alban) — site du syndicat
 * Hersain-Bocage. La page mêle tarifs, créneaux de clubs et grille publique :
 * seule la grille nomme au moins cinq jours, d'où le filtrage par contenu.
 */
export async function fetchHersainPage(
  url: string,
  opts?: { fresh?: boolean }
): Promise<PageSections> {
  const page = parseWeekMatrixPage(await fetchHtml(url, opts));
  if (page.sections.length === 0) {
    throw new Error(`Aucune grille d'horaires sur ${url}`);
  }
  // La page écrit le numéro en clair (« 05.61.70.53.41 »), sans lien « tel: » : numéro de l'accueil relevé et figé.
  return { ...page, phone: page.phone ?? "0561705341" };
}
