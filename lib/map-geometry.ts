import { POOL_COORDS, type LatLon } from "./pools";

/**
 * Fond de carte schématique de Toulouse. Tout est figé ici : l'application ne
 * télécharge aucune tuile et n'appelle aucun service de cartographie — la page
 * « confidentialité » promet qu'aucune requête ne part vers un tiers.
 *
 * Les cours d'eau sont tracés à partir de points relevés au géocodage et de
 * l'axe hydrographique BD TOPO (IGN, relevé une fois) puis lissés : c'est un
 * schéma d'orientation, pas un relevé topographique.
 */

/** Cours de la Garonne, du sud au nord (l'île du Ramier est au milieu). */
const GARONNE: LatLon[] = [
  { lat: 43.5592, lon: 1.44 },
  { lat: 43.5719, lon: 1.4377 },
  { lat: 43.582, lon: 1.437 },
  { lat: 43.5924, lon: 1.4386 },
  { lat: 43.5966, lon: 1.4405 },
  { lat: 43.5992, lon: 1.4385 },
  { lat: 43.6024, lon: 1.4372 },
  { lat: 43.6025, lon: 1.435 },
  // Coude de Saint-Pierre puis Bazacle et Sept-Deniers : axe BD TOPO, les
  // adresses géocodées des quais tombaient ~500 m trop à l'est (rive droite).
  { lat: 43.6034, lon: 1.427 },
  { lat: 43.6046, lon: 1.4214 },
  { lat: 43.6057, lon: 1.4174 },
  { lat: 43.6079, lon: 1.4136 },
  { lat: 43.6103, lon: 1.4099 },
  { lat: 43.6149, lon: 1.4046 },
  { lat: 43.6185, lon: 1.4025 },
  { lat: 43.6247, lon: 1.4002 },
  // Hors cadre : le cours d'eau sort du plan au lieu de s'arrêter en l'air.
  { lat: 43.638, lon: 1.3875 },
];

/** Canal du Midi, du port de l'Embouchure au sud-est vers Ramonville. */
const CANAL: LatLon[] = [
  { lat: 43.611, lon: 1.4184 },
  { lat: 43.6122, lon: 1.426 },
  { lat: 43.6155, lon: 1.438 },
  { lat: 43.6111, lon: 1.4523 },
  { lat: 43.5968, lon: 1.4565 },
  { lat: 43.5877, lon: 1.4605 },
  { lat: 43.5757, lon: 1.4668 },
  { lat: 43.5555, lon: 1.479 },
];

/** Cadre géographique de la carte, marge comprise. */
const BOUNDS = { latMin: 43.5580, latMax: 43.6330, lonMin: 1.3900, lonMax: 1.4840 };

/** Un degré de longitude est plus court qu'un degré de latitude à cette latitude. */
const LON_SCALE = Math.cos(((BOUNDS.latMin + BOUNDS.latMax) / 2) * (Math.PI / 180));

export const VIEW_WIDTH = 1000;
export const VIEW_HEIGHT = Math.round(
  (VIEW_WIDTH * (BOUNDS.latMax - BOUNDS.latMin)) / ((BOUNDS.lonMax - BOUNDS.lonMin) * LON_SCALE)
);

export interface Point {
  x: number;
  y: number;
}

/** Projection équirectangulaire : suffisante et sans distorsion visible à l'échelle d'une ville. */
export function project({ lat, lon }: LatLon): Point {
  const x = ((lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin)) * VIEW_WIDTH;
  const y = ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * VIEW_HEIGHT;
  return { x, y };
}

/**
 * Courbe de Catmull-Rom convertie en Béziers cubiques : la ligne brisée des
 * points relevés devient un cours d'eau lisse.
 */
export function smoothPath(coords: LatLon[]): string {
  const pts = coords.map(project);
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Canal de Brienne : il relie la Garonne (Saint-Pierre) aux Ponts-Jumeaux. */
const BRIENNE: LatLon[] = [
  { lat: 43.6036, lon: 1.4347 },
  { lat: 43.6053, lon: 1.4336 },
  { lat: 43.6073, lon: 1.4281 },
  { lat: 43.6096, lon: 1.4215 },
  { lat: 43.611, lon: 1.4184 },
];

/**
 * Canal latéral à la Garonne : aux Ponts-Jumeaux, le canal du Midi et le
 * Brienne le rejoignent ; il continue vers le nord et sort du plan.
 */
const LATERAL: LatLon[] = [
  { lat: 43.611, lon: 1.4183 },
  { lat: 43.6242, lon: 1.42 },
  { lat: 43.638, lon: 1.4219 },
];

export const GARONNE_PATH = smoothPath(GARONNE);
export const CANAL_PATH = smoothPath(CANAL);
export const BRIENNE_PATH = smoothPath(BRIENNE);
export const LATERAL_PATH = smoothPath(LATERAL);

export interface MetroStation extends LatLon {
  nom: string;
}

/**
 * Stations des lignes A et B, dans l'ordre du parcours (données ouvertes
 * Tisséo / Toulouse Métropole, relevées une fois et figées). La ligne est
 * tracée en lissant la polyligne des stations : schéma, pas tracé réel.
 */
const METRO_A: MetroStation[] = [
  { nom: "Basso Cambo", lat: 43.57015, lon: 1.39221 },
  { nom: "Bellefontaine", lat: 43.56602, lon: 1.39798 },
  { nom: "Reynerie", lat: 43.57093, lon: 1.40179 },
  { nom: "Mirail-Université", lat: 43.57469, lon: 1.40208 },
  { nom: "Bagatelle", lat: 43.57998, lon: 1.41237 },
  { nom: "Mermoz", lat: 43.58342, lon: 1.41516 },
  { nom: "Fontaine Lestang", lat: 43.58756, lon: 1.41851 },
  { nom: "Arènes", lat: 43.59338, lon: 1.41861 },
  { nom: "Patte d'Oie", lat: 43.59636, lon: 1.42304 },
  { nom: "St Cyprien - République", lat: 43.59795, lon: 1.43172 },
  { nom: "Esquirol", lat: 43.5999, lon: 1.44403 },
  { nom: "Capitole", lat: 43.60417, lon: 1.44508 },
  { nom: "Jean Jaurès", lat: 43.60618, lon: 1.44964 },
  { nom: "Marengo-SNCF", lat: 43.61072, lon: 1.45515 },
  { nom: "Jolimont", lat: 43.61528, lon: 1.46348 },
  { nom: "Roseraie", lat: 43.61995, lon: 1.46966 },
  { nom: "Argoulets", lat: 43.6243, lon: 1.4768 },
  { nom: "Balma-Gramont", lat: 43.62912, lon: 1.48283 },
];

const METRO_B: MetroStation[] = [
  { nom: "Borderouge", lat: 43.64053, lon: 1.45247 },
  { nom: "Trois Cocus", lat: 43.63805, lon: 1.44444 },
  { nom: "La Vache", lat: 43.63388, lon: 1.43569 },
  { nom: "Barrière de Paris", lat: 43.6266, lon: 1.43391 },
  { nom: "Minimes - Cl. Nougaro", lat: 43.62026, lon: 1.43583 },
  { nom: "Canal du Midi", lat: 43.61546, lon: 1.43439 },
  { nom: "Compans - Caffarelli", lat: 43.61053, lon: 1.43556 },
  { nom: "Jeanne d'Arc", lat: 43.60899, lon: 1.44514 },
  { nom: "Jean Jaurès", lat: 43.60567, lon: 1.44863 },
  { nom: "François Verdier", lat: 43.60069, lon: 1.45211 },
  { nom: "Carmes", lat: 43.59765, lon: 1.44555 },
  { nom: "Palais de Justice", lat: 43.59233, lon: 1.44458 },
  { nom: "St Michel - Marcel Langer", lat: 43.58634, lon: 1.44708 },
  { nom: "Empalot", lat: 43.57982, lon: 1.44202 },
  { nom: "Saint Agne SNCF", lat: 43.58038, lon: 1.45011 },
  { nom: "Saouzelong", lat: 43.57976, lon: 1.45889 },
  { nom: "Rangueil", lat: 43.57476, lon: 1.4617 },
  { nom: "Faculté de Pharmacie", lat: 43.56817, lon: 1.46443 },
  { nom: "Université Paul Sabatier", lat: 43.56094, lon: 1.46316 },
  { nom: "Ramonville", lat: 43.55571, lon: 1.47639 },
];

/** Marge qui garde les pastilles « A » / « B » entièrement dans le cadre. */
const BADGE_MARGIN = 22;

function clampToFrame(p: Point): Point {
  return {
    x: Math.min(Math.max(p.x, BADGE_MARGIN), VIEW_WIDTH - BADGE_MARGIN),
    y: Math.min(Math.max(p.y, BADGE_MARGIN), VIEW_HEIGHT - BADGE_MARGIN),
  };
}

/**
 * Position de la pastille de terminus : sur le terminus s'il est visible,
 * sinon là où la ligne sort du cadre (Borderouge et Ramonville sont hors plan).
 */
function badgePoint(stations: MetroStation[], fromEnd: boolean): Point {
  const pts = stations.map(project);
  const ordered = fromEnd ? [...pts].reverse() : pts;
  const inFrame = (p: Point) =>
    p.x >= BADGE_MARGIN &&
    p.x <= VIEW_WIDTH - BADGE_MARGIN &&
    p.y >= BADGE_MARGIN &&
    p.y <= VIEW_HEIGHT - BADGE_MARGIN;
  const i = ordered.findIndex(inFrame);
  if (i <= 0) return clampToFrame(ordered[0]);
  const a = ordered[i];
  const b = ordered[i - 1];
  let t = 1;
  if (b.x < BADGE_MARGIN) t = Math.min(t, (a.x - BADGE_MARGIN) / (a.x - b.x));
  if (b.x > VIEW_WIDTH - BADGE_MARGIN) t = Math.min(t, (VIEW_WIDTH - BADGE_MARGIN - a.x) / (b.x - a.x));
  if (b.y < BADGE_MARGIN) t = Math.min(t, (a.y - BADGE_MARGIN) / (a.y - b.y));
  if (b.y > VIEW_HEIGHT - BADGE_MARGIN) t = Math.min(t, (VIEW_HEIGHT - BADGE_MARGIN - a.y) / (b.y - a.y));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export interface MetroLine {
  id: "A" | "B";
  path: string;
  stops: (Point & { nom: string })[];
  badges: [Point, Point];
}

export const METRO_LINES: MetroLine[] = [
  {
    id: "A",
    path: smoothPath(METRO_A),
    stops: METRO_A.map((s) => ({ nom: s.nom, ...project(s) })),
    badges: [badgePoint(METRO_A, false), badgePoint(METRO_A, true)],
  },
  {
    id: "B",
    path: smoothPath(METRO_B),
    // Jean Jaurès est déjà pointé par la ligne A : un seul point de correspondance.
    stops: METRO_B.filter((s) => s.nom !== "Jean Jaurès").map((s) => ({ nom: s.nom, ...project(s) })),
    badges: [badgePoint(METRO_B, false), badgePoint(METRO_B, true)],
  },
];

export type MonumentIcon = "capitole" | "basilique" | "pont" | "stade" | "zenith";

export interface Monument {
  nom: string;
  icon: MonumentIcon;
  point: Point;
  labelSide: "left" | "right";
  /** Rotation de l'icône en degrés (le Pont Neuf suit l'axe de la Garonne). */
  rotate?: number;
}

/** Repères connus des Toulousains, géocodés une fois via la BAN et figés. */
const MONUMENT_DEFS: (Omit<Monument, "point"> & LatLon)[] = [
  { nom: "Capitole", icon: "capitole", lat: 43.60435, lon: 1.44305, labelSide: "left" },
  { nom: "St-Sernin", icon: "basilique", lat: 43.60851, lon: 1.44206, labelSide: "left" },
  { nom: "Pont Neuf", icon: "pont", lat: 43.59923, lon: 1.43853, labelSide: "left", rotate: -29 },
  { nom: "Stadium", icon: "stade", lat: 43.582, lon: 1.4358, labelSide: "left" },
  { nom: "Zénith", icon: "zenith", lat: 43.6013, lon: 1.4103, labelSide: "left" },
];

export const MONUMENTS: Monument[] = MONUMENT_DEFS.map(({ lat, lon, ...m }) => ({
  ...m,
  point: project({ lat, lon }),
}));

/**
 * Côté où poser l'étiquette de chaque site, réglé à la main pour qu'aucune ne
 * chevauche sa voisine ni ne sorte du cadre.
 */
const LABEL_SIDE: Record<string, "left" | "right"> = {
  "piscine-alban-minville": "right",
  "piscine-alex-jany": "left",
  "piscine-alfred-nakache-ete": "right",
  "piscine-bellevue": "right",
  "piscine-chapou-ete": "left",
  "piscine-jean-boiteux-espace-job": "right",
  "piscine-leo-lagrange": "right",
  "piscine-papus": "left",
  "piscine-toulouse-lautrec": "left",
  "piscine-yvonne-godard": "left",
};

export interface MapSite {
  /** Piscines de ce site, dans l'ordre où elles doivent être citées */
  slugs: string[];
  point: Point;
  labelSide: "left" | "right";
}

/**
 * Regroupe les piscines par position : Nakache été, Nakache hiver et Castex
 * occupent le même complexe et ne doivent former qu'un seul repère.
 */
export function groupSites(slugs: string[]): MapSite[] {
  const sites = new Map<string, MapSite>();
  for (const slug of slugs) {
    const coords = POOL_COORDS[slug];
    if (!coords) continue;
    const key = `${coords.lat},${coords.lon}`;
    const site = sites.get(key);
    if (site) {
      site.slugs.push(slug);
      continue;
    }
    sites.set(key, {
      slugs: [slug],
      point: project(coords),
      labelSide: LABEL_SIDE[slug] ?? "right",
    });
  }
  return [...sites.values()];
}
