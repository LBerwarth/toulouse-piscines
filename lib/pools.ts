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

/**
 * Secteur géographique, pour le filtre « Secteur » : la ville de Toulouse, le
 * reste de Toulouse Métropole, ou les communes de l'aire urbaine hors
 * métropole (Ramonville, Castanet, Muretain…).
 */
export type PoolZone = "toulouse" | "metropole" | "alentours";

/**
 * Site d'où sont scrapés les horaires. Chaque valeur a son adaptateur dans
 * lib/sources — les mairies ne partagent aucune structure de page.
 */
export type PoolSource = "toulouse" | "colomiers" | "hersain" | "blagnac" | "launaguet" | "oasis" | "balma" | "plaisance" | "leguevin";

export interface Pool {
  slug: string;
  name: string;
  /** Commune de l'équipement — sert aux itinéraires et à l'affichage. */
  commune: string;
  zone: PoolZone;
  /** Défaut « toulouse » (page mairie de Toulouse déduite du slug). */
  source?: PoolSource;
  /** URL de la page d'horaires, quand elle n'est pas déduite du slug. */
  url?: string;
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
  { slug: "piscine-alban-minville", name: "Alban Minville", commune: "Toulouse", zone: "toulouse", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  { slug: "piscine-alex-jany", name: "Alex Jany", commune: "Toulouse", zone: "toulouse", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  // Grand bassin de 150 m × 48 m : hors gabarit 25/50
  { slug: "piscine-alfred-nakache-ete", name: "Alfred Nakache été", commune: "Toulouse", zone: "toulouse", env: "outdoor", basins: [] },
  { slug: "piscine-alfred-nakache-hiver", name: "Alfred Nakache hiver", commune: "Toulouse", zone: "toulouse", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  // Bassins sportifs intérieurs (25 m) + bassin nordique extérieur (25 m)
  {
    slug: "piscine-bellevue",
    name: "Bellevue", commune: "Toulouse", zone: "toulouse",
    env: "mixed",
    basins: [
      { length: 25, env: "indoor" },
      { length: 25, env: "outdoor" },
    ],
  },
  // Bassin nordique de 50 m en plein air, ouvert toute l'année
  { slug: "piscine-castex", name: "Castex", commune: "Toulouse", zone: "toulouse", env: "outdoor", basins: [{ length: 50, env: "outdoor" }] },
  { slug: "piscine-chapou-ete", name: "Chapou été", commune: "Toulouse", zone: "toulouse", env: "outdoor", basins: [{ length: 25, env: "outdoor" }] },
  {
    slug: "piscine-jean-boiteux-espace-job",
    name: "Jean Boiteux (Espace Job)", commune: "Toulouse", zone: "toulouse",
    env: "indoor",
    basins: [{ length: 25, env: "indoor" }],
  },
  // Bassin olympique de 50 m (8 couloirs)
  { slug: "piscine-leo-lagrange", name: "Léo Lagrange", commune: "Toulouse", zone: "toulouse", env: "indoor", basins: [{ length: 50, env: "indoor" }] },
  // Toit ouvrant l'été, mais bassin couvert à la base
  { slug: "piscine-papus", name: "Papus", commune: "Toulouse", zone: "toulouse", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  // Bassin nordique « Gisèle Vallerey » de 50 m (extérieur) + bassin intérieur
  // de 25 m — en rénovation (~2 ans), mais déclaré : la grille scrapée l'affiche
  // « fermé », comme le fait déjà le filtre Intérieur pour cette piscine mixte.
  {
    slug: "piscine-toulouse-lautrec",
    name: "Toulouse Lautrec", commune: "Toulouse", zone: "toulouse",
    env: "mixed",
    basins: [
      { length: 25, env: "indoor" },
      { length: 50, env: "outdoor" },
    ],
  },
  { slug: "piscine-yvonne-godard", name: "Yvonne Godard", commune: "Toulouse", zone: "toulouse", env: "indoor", basins: [{ length: 25, env: "indoor" }] },
  // Piscines hors Toulouse : chacune a son site, d'où `source` + `url`.
  {
    slug: "espace-nautique-jean-vauchere",
    name: "Jean Vauchère",
    commune: "Colomiers",
    zone: "metropole",
    source: "colomiers",
    url: "https://www.espacenautique-colomiers.com/infos-pratiques/horaires",
    // Quatre bassins couverts + bassins extérieurs (lagune, rivière de 120 m)
    env: "mixed",
    // Sportif de 6 lignes et entraînement de 4 lignes, tous deux de 25 m ; en
    // extérieur, ni lagune ni rivière ne sont des bassins de nage.
    basins: [{ length: 25, env: "indoor" }],
  },
  {
    slug: "complexe-nautique-des-ramiers",
    name: "Les Ramiers",
    commune: "Blagnac",
    zone: "metropole",
    source: "blagnac",
    url: "https://www.mairie-blagnac.fr/piscine-des-ramiers-et-activites",
    // Bassin nordique extérieur + bassin intérieur, chauffés à la géothermie
    env: "mixed",
    basins: [
      { length: 25, env: "indoor" },
      { length: 50, env: "outdoor" },
    ],
  },
  {
    slug: "piscine-launaguet",
    name: "Launaguet",
    commune: "Launaguet",
    zone: "metropole",
    source: "launaguet",
    url: "https://www.mairie-launaguet.fr/ouverture-de-la-piscine-dete/",
    // Piscine d'été : grand bassin de 12 × 25 m et pataugeoire
    env: "outdoor",
    basins: [{ length: 25, env: "outdoor" }],
  },
  {
    slug: "piscine-oasis-de-la-ramee",
    name: "L'Oasis de la Ramée",
    commune: "Tournefeuille",
    zone: "metropole",
    source: "oasis",
    url: "https://www.loasisdelaramee.fr/infos-pratiques/horaires-d-ouverture-au-public.html",
    // Piscine intercommunale Cugnaux - Tournefeuille - Villeneuve-Tolosane
    env: "indoor",
    // Bassin sportif de 5 couloirs sur 25 m, plus un bassin ludique
    basins: [{ length: 25, env: "indoor" }],
  },
  {
    slug: "piscine-balma",
    name: "Balma",
    commune: "Balma",
    zone: "metropole",
    source: "balma",
    url: "https://www.mairie-balma.fr/contacts/piscine-municipale/",
    env: "indoor",
    // Bassin sportif couvert de 25 m × 12,5 m, cinq lignes d'eau
    basins: [{ length: 25, env: "indoor" }],
  },
  // Aire urbaine hors métropole (Plaisance-du-Touch est au Muretain Agglo,
  // Léguevin à la CC de la Save au Touch) : secteur « alentours ».
  {
    slug: "piscine-plaisance-du-touch",
    name: "Plaisance-du-Touch",
    commune: "Plaisance-du-Touch",
    zone: "alentours",
    source: "plaisance",
    url: "https://www.plaisancedutouch.fr/annuaire/piscine-municipale/",
    // Bassin chauffé de 25 m et pataugeoire, de fin mai à fin août
    env: "outdoor",
    basins: [{ length: 25, env: "outdoor" }],
  },
  {
    slug: "piscine-leguevin",
    name: "Léguevin",
    commune: "Léguevin",
    zone: "alentours",
    source: "leguevin",
    url: "https://www.ville-leguevin.fr/vivre-a-leguevin/culture-loisirs/piscine-municipale/",
    // Piscine d'été en plein air ; longueur du grand bassin non publiée
    env: "outdoor",
    basins: [],
  },
  {
    slug: "piscine-hersain",
    name: "Hersain",
    commune: "Saint-Alban",
    zone: "metropole",
    source: "hersain",
    url: "https://www.hersain-bocage.fr/fr/le-syndicat-intercommunal/piscine/",
    env: "indoor",
    // Un bassin de 25 m et une pataugeoire
    basins: [{ length: 25, env: "indoor" }],
  },
];

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Position de chaque piscine, obtenue une fois pour toutes en géocodant
 * l'adresse publiée dans « Les coordonnées » de la page mairie (Base Adresse
 * Nationale, api-adresse.data.gouv.fr). Figée ici plutôt que géocodée à
 * l'exécution : l'application ne doit appeler aucun service tiers.
 * Nakache été, Nakache hiver et Castex partagent un même point — c'est le même
 * complexe de l'île du Ramier.
 */
export const POOL_COORDS: Record<string, LatLon> = {
  "piscine-alban-minville": { lat: 43.56454, lon: 1.39908 },
  "piscine-alex-jany": { lat: 43.62496, lon: 1.47764 },
  "piscine-alfred-nakache-ete": { lat: 43.58444, lon: 1.43662 },
  "piscine-alfred-nakache-hiver": { lat: 43.58444, lon: 1.43662 },
  "piscine-bellevue": { lat: 43.56932, lon: 1.45588 },
  "piscine-castex": { lat: 43.58444, lon: 1.43662 },
  "piscine-chapou-ete": { lat: 43.60868, lon: 1.41949 },
  "piscine-jean-boiteux-espace-job": { lat: 43.61685, lon: 1.40836 },
  "piscine-leo-lagrange": { lat: 43.60722, lon: 1.45377 },
  "piscine-papus": { lat: 43.57456, lon: 1.41724 },
  "piscine-toulouse-lautrec": { lat: 43.62813, lon: 1.43897 },
  "piscine-yvonne-godard": { lat: 43.57116, lon: 1.44454 },
  // Hors Toulouse (vues métropole / aire urbaine du plan)
  "espace-nautique-jean-vauchere": { lat: 43.60894, lon: 1.33225 },
  "complexe-nautique-des-ramiers": { lat: 43.63756, lon: 1.40217 },
  "piscine-balma": { lat: 43.60784, lon: 1.50228 },
  "piscine-launaguet": { lat: 43.67736, lon: 1.45266 },
  // Coordonnées du jeu de données « piscines » de data.toulouse-metropole.fr
  "piscine-oasis-de-la-ramee": { lat: 43.56496, lon: 1.34795 },
  "piscine-hersain": { lat: 43.68209, lon: 1.42554 },
  "piscine-plaisance-du-touch": { lat: 43.56343, lon: 1.30272 },
  // Centre-ville : la mairie ne publie pas l'adresse de la piscine
  "piscine-leguevin": { lat: 43.59125, lon: 1.23065 },
};

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
  return pool.url ?? `${POOL_BASE_URL}${pool.slug}`;
}

/**
 * Lien « itinéraire » universel vers la piscine. Sur mobile, le toucher ouvre
 * l'app de navigation par défaut (Google Maps, Plans…) directement en mode
 * itinéraire ; sinon Google Maps dans le navigateur. La destination est
 * cherchée par nom + commune — fiable pour ces équipements municipaux
 * référencés, sans dépendre d'une adresse postale stockée.
 */
export function poolDirectionsUrl(pool: Pick<Pool, "name" | "commune">): string {
  const destination = encodeURIComponent(`Piscine ${pool.name} ${pool.commune}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

/** « 0561222480 » → « 05 61 22 24 80 » */
export function formatPhone(phone: string): string {
  return phone.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** Format international : un mobile en itinérance compose le numéro tel quel. */
export function phoneHref(phone: string): string {
  return `tel:+33${phone.slice(1)}`;
}
