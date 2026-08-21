import { fetchHtml } from "./http";
import { parseLabelledPage } from "./labelled";
import type { PageSections } from "../scrape";

/** Piscine d'été de Launaguet — ouverte de juillet à fin août seulement. */
export async function fetchLaunaguetPage(
  url: string,
  opts?: { fresh?: boolean }
): Promise<PageSections> {
  const page = parseLabelledPage(await fetchHtml(url, opts), {
    blockSelector: ".entry-content",
    seasonLabel: /dates d.ouverture/i,
    hoursLabel: /horaires d.ouverture/i,
  });
  if (page.sections.length === 0) {
    throw new Error(`Aucun horaire d'ouverture sur ${url}`);
  }
  return page;
}
