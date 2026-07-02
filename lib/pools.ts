/** Type de bassins d'une piscine : couvert, plein air, ou les deux. */
export type PoolEnv = "indoor" | "outdoor" | "mixed";

/** Longueur de bassin filtrable (couloirs de nage standard). */
export type BasinLength = 25 | 50;

/**
 * Bassin de nage « standard » (25 m ou 50 m) et son emplacement. Relevé sur la
 * page mairie de chaque piscine (rubrique équipements) — les dimensions n'étant
 * pas publiées dans les grilles d'horaires, elles ne peuvent pas être scrapées.
 */
export interface PoolBasinMeta {
  length: BasinLength;
  env: "indoor" | "outdoor";
}

export interface Pool {
  slug: string;
  name: string;
  /**
   * « mixed » = la piscine a à la fois des bassins intérieurs et extérieurs ;
   * le tri intérieur/extérieur se fait alors au niveau du bassin d'après son
   * libellé (voir classifyBasinEnv).
   */
  env: PoolEnv;
  /**
   * Bassins de 25/50 m de la piscine (vide si aucun bassin standard, ex.
   * Nakache été et son grand bassin de 150 m × 48 m).
   */
  basins: PoolBasinMeta[];
}

export const POOL_BASE_URL = "https://metropole.toulouse.fr/annuaire/";

// Les 12 piscines municipales listées sur
// https://metropole.toulouse.fr/sortir/sport/les-piscines-toulousaines
// env : déterminé d'après la page de chaque piscine (intro + libellés de bassins).
// basins : dimensions relevées sur ces mêmes pages (grand bassin 25 m × …).
export const POOLS: Pool[] = [
  { slug: "piscine-alban-minville", name: "Alban Minville", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  { slug: "piscine-alex-jany", name: "Alex Jany", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  // Grand bassin de 150 m × 48 m : hors gabarit 25/50
  { slug: "piscine-alfred-nakache-ete", name: "Alfred Nakache été", env: "outdoor", basins: [] },
  { slug: "piscine-alfred-nakache-hiver", name: "Alfred Nakache hiver", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  // Bassins sportifs intérieurs (25 m) + bassin nordique extérieur (25 m)
  {
    slug: "piscine-bellevue",
    name: "Bellevue",
    env: "mixed",
    basins: [
      { length: 25, env: "indoor" },
      { length: 25, env: "outdoor" },
    ],
  },
  // Bassin nordique de 50 m en plein air, ouvert toute l'année
  { slug: "piscine-castex", name: "Castex", env: "outdoor", basins: [{ length: 50, env: "outdoor" }] },
  { slug: "piscine-chapou-ete", name: "Chapou été", env: "outdoor", basins: [{ length: 25, env: "outdoor" }] },
  {
    slug: "piscine-jean-boiteux-espace-job",
    name: "Jean Boiteux (Espace Job)",
    env: "indoor",
    basins: [{ length: 25, env: "indoor" }],
  },
  // Bassin olympique de 50 m (8 couloirs)
  { slug: "piscine-leo-lagrange", name: "Léo Lagrange", env: "indoor", basins: [{ length: 50, env: "indoor" }] },
  // Toit ouvrant l'été, mais bassin couvert à la base
  { slug: "piscine-papus", name: "Papus", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  // Bassin nordique « Gisèle Vallerey » de 50 m (extérieur) + bassin intérieur
  // de 25 m — en rénovation (~2 ans), mais déclaré : la grille scrapée l'affiche
  // « fermé », comme le fait déjà le filtre Intérieur pour cette piscine mixte.
  {
    slug: "piscine-toulouse-lautrec",
    name: "Toulouse Lautrec",
    env: "mixed",
    basins: [
      { length: 25, env: "indoor" },
      { length: 50, env: "outdoor" },
    ],
  },
  { slug: "piscine-yvonne-godard", name: "Yvonne Godard", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
];

/**
 * La piscine possède-t-elle un bassin de la longueur demandée — le cas échéant
 * dans l'emplacement demandé (intérieur / plein air) ? Sert au filtre 25/50 m,
 * combinable avec le filtre intérieur/plein air.
 */
export function poolHasBasinLength(
  pool: Pool,
  length: BasinLength,
  env?: "indoor" | "outdoor"
): boolean {
  return pool.basins.some((b) => b.length === length && (!env || b.env === env));
}

export function poolUrl(pool: Pool): string {
  return `${POOL_BASE_URL}${pool.slug}`;
}

/**
 * Lien « itinéraire » universel vers la piscine. Sur mobile, le toucher ouvre
 * l'app de navigation par défaut (Google Maps, Plans…) directement en mode
 * itinéraire ; sinon Google Maps dans le navigateur. La destination est
 * cherchée par nom + « Toulouse » — fiable pour ces équipements municipaux
 * référencés, sans dépendre d'une adresse postale stockée.
 */
export function poolDirectionsUrl(pool: Pool): string {
  const destination = encodeURIComponent(`Piscine ${pool.name} Toulouse`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
