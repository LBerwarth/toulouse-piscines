import { fetchHtml } from "./http";
import { parseProseBlockPage } from "./prose-block";
import type { PageSections } from "../scrape";

/**
 * Complexe nautique des Ramiers (Blagnac). La page enchaîne horaires, tarifs et
 * grilles de cours (aquabike, aquafitness) dans des blocs de même classe : seul
 * celui titré « HORAIRES » décrit l'ouverture au public.
 */
export async function fetchBlagnacPage(
  url: string,
  opts?: { fresh?: boolean }
): Promise<PageSections> {
  const page = parseProseBlockPage(await fetchHtml(url, opts), {
    blockSelector: ".ce-bodytext",
    blockTitle: /^horaires$/i,
  });
  if (page.sections.length === 0) {
    throw new Error(`Aucun bloc d'horaires sur ${url}`);
  }
  return page;
}
