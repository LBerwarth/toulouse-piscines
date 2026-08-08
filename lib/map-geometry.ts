import { POOL_COORDS, type LatLon } from "./pools";

/**
 * Fond de carte schématique de Toulouse. Tout est figé ici : l'application ne
 * télécharge aucune tuile et n'appelle aucun service de cartographie — la page
 * « confidentialité » promet qu'aucune requête ne part vers un tiers.
 *
 * Les deux cours d'eau sont tracés à partir de points relevés au géocodage
 * (ponts, quais, écluses) puis lissés : c'est un schéma d'orientation, pas un
 * relevé topographique.
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
  { lat: 43.6032, lon: 1.428 },
  { lat: 43.6068, lon: 1.4224 },
  { lat: 43.6163, lon: 1.4097 },
  { lat: 43.6247, lon: 1.4002 },
  // Hors cadre : le cours d'eau sort du plan au lieu de s'arrêter en l'air.
  { lat: 43.638, lon: 1.3875 },
];

/** Canal du Midi, des Ponts-Jumeaux au sud-est vers Ramonville. */
const CANAL: LatLon[] = [
  // Ponts-Jumeaux : le canal part de la Garonne.
  { lat: 43.6128, lon: 1.418 },
  { lat: 43.6136, lon: 1.4249 },
  { lat: 43.6155, lon: 1.438 },
  { lat: 43.6111, lon: 1.4523 },
  { lat: 43.5968, lon: 1.4565 },
  { lat: 43.5877, lon: 1.4605 },
  { lat: 43.5757, lon: 1.4668 },
  { lat: 43.5555, lon: 1.479 },
];

/** Cadre géographique de la carte, marge comprise. */
const BOUNDS = { latMin: 43.5605, latMax: 43.6330, lonMin: 1.3930, lonMax: 1.4840 };

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

export const GARONNE_PATH = smoothPath(GARONNE);
export const CANAL_PATH = smoothPath(CANAL);

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
