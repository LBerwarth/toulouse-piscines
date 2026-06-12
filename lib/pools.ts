/** Type de bassins d'une piscine : couvert, plein air, ou les deux. */
export type PoolEnv = "indoor" | "outdoor" | "mixed";

export interface Pool {
  slug: string;
  name: string;
  /**
   * « mixed » = la piscine a à la fois des bassins intérieurs et extérieurs ;
   * le tri intérieur/extérieur se fait alors au niveau du bassin d'après son
   * libellé (voir classifyBasinEnv).
   */
  env: PoolEnv;
}

export const POOL_BASE_URL = "https://metropole.toulouse.fr/annuaire/";

// Les 12 piscines municipales listées sur
// https://metropole.toulouse.fr/sortir/sport/les-piscines-toulousaines
// env : déterminé d'après la page de chaque piscine (intro + libellés de bassins).
export const POOLS: Pool[] = [
  { slug: "piscine-alban-minville", name: "Alban Minville", env: "indoor" },
  { slug: "piscine-alex-jany", name: "Alex Jany", env: "indoor" },
  { slug: "piscine-alfred-nakache-ete", name: "Alfred Nakache été", env: "outdoor" },
  { slug: "piscine-alfred-nakache-hiver", name: "Alfred Nakache hiver", env: "indoor" },
  // Bassins sportifs intérieurs + bassins nordiques extérieurs
  { slug: "piscine-bellevue", name: "Bellevue", env: "mixed" },
  // Bassin nordique en plein air, ouvert toute l'année
  { slug: "piscine-castex", name: "Castex", env: "outdoor" },
  { slug: "piscine-chapou-ete", name: "Chapou été", env: "outdoor" },
  { slug: "piscine-jean-boiteux-espace-job", name: "Jean Boiteux (Espace Job)", env: "indoor" },
  { slug: "piscine-leo-lagrange", name: "Léo Lagrange", env: "indoor" },
  // Toit ouvrant l'été, mais bassin couvert à la base
  { slug: "piscine-papus", name: "Papus", env: "indoor" },
  // Bassin nordique « Gisèle Vallerey » (extérieur) + halle et bassin intérieur
  { slug: "piscine-toulouse-lautrec", name: "Toulouse Lautrec", env: "mixed" },
  { slug: "piscine-yvonne-godard", name: "Yvonne Godard", env: "indoor" },
];

export function poolUrl(pool: Pool): string {
  return `${POOL_BASE_URL}${pool.slug}`;
}
