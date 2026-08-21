import { POOL_COORDS, type LatLon } from "./pools";
import type { ZoneFilter } from "./filters";

/**
 * Fond de carte schématique, décliné en trois vues emboîtées qui suivent le
 * filtre « Secteur » : la ville, la métropole, l'aire urbaine. Tout est figé
 * ici : l'application ne télécharge aucune tuile et n'appelle aucun service de
 * cartographie — la page « confidentialité » promet qu'aucune requête ne part
 * vers un tiers.
 *
 * Les cours d'eau sont tracés à partir de points relevés au géocodage et de
 * l'axe hydrographique BD TOPO (IGN, relevé une fois) puis lissés : c'est un
 * schéma d'orientation, pas un relevé topographique.
 */

/** Cours de la Garonne dans la ville, du sud au nord (l'île du Ramier au milieu). */
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
  // Hors cadre (vue ville) : le cours d'eau sort du plan au lieu de s'arrêter en l'air.
  { lat: 43.638, lon: 1.3875 },
];

// Prolongements pour les vues larges, sinon le fleuve s'arrêterait en plein cadre.
/** Vers Portet, au sud. */
const GARONNE_SOUTH: LatLon[] = [
  { lat: 43.54, lon: 1.424 },
  { lat: 43.548, lon: 1.432 },
];
/** Rive de Blagnac puis Beauzelle, Seilh et Fenouillet, au nord. */
const GARONNE_NORTH: LatLon[] = [
  { lat: 43.652, lon: 1.383 },
  { lat: 43.666, lon: 1.388 },
  { lat: 43.68, lon: 1.394 },
  { lat: 43.694, lon: 1.398 },
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

/** Suite du canal après Ramonville (vue large : il sort du cadre au lieu de s'arrêter). */
const CANAL_SOUTH: LatLon[] = [{ lat: 43.545, lon: 1.4885 }];

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

/** Suite du canal latéral vers Fenouillet et Lespinasse (vues larges). */
const LATERAL_NORTH: LatLon[] = [
  { lat: 43.652, lon: 1.4185 },
  { lat: 43.666, lon: 1.412 },
  { lat: 43.68, lon: 1.404 },
  { lat: 43.694, lon: 1.397 },
];

/**
 * Le Touch : il longe Plaisance, La Ramée et Tournefeuille puis rejoint la
 * Garonne au nord de Blagnac — c'est le repère naturel de l'ouest toulousain.
 */
const TOUCH: LatLon[] = [
  { lat: 43.545, lon: 1.276 },
  { lat: 43.5605, lon: 1.302 },
  { lat: 43.573, lon: 1.331 },
  { lat: 43.582, lon: 1.344 },
  { lat: 43.592, lon: 1.36 },
  // Saint-Martin-du-Touch, puis l'est de l'aéroport
  { lat: 43.601, lon: 1.373 },
  { lat: 43.613, lon: 1.383 },
  { lat: 43.6285, lon: 1.388 },
  { lat: 43.64, lon: 1.3885 },
  // Confluence aux Quinze Sols (Beauzelle) — le point est posé SUR le tracé de
  // la Garonne, sinon la rivière semble s'arrêter en plein champ.
  { lat: 43.65, lon: 1.3837 },
];

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

export type MonumentIcon = "capitole" | "basilique" | "pont" | "stade" | "zenith" | "avion";

interface MonumentDef extends LatLon {
  nom: string;
  icon: MonumentIcon;
  labelSide: "left" | "right";
  /** Rotation de l'icône en degrés (le Pont Neuf suit l'axe de la Garonne). */
  rotate?: number;
  /** Vues où le repère est affiché — au zoom aire urbaine, les monuments du
   *  centre-ville se chevaucheraient en une tache illisible. */
  zones: ZoneFilter[];
}

/** Repères connus des Toulousains, géocodés une fois via la BAN et figés. */
const CITY: ZoneFilter[] = ["toulouse", "metropole"];
const MONUMENT_DEFS: MonumentDef[] = [
  { nom: "Capitole", icon: "capitole", lat: 43.60435, lon: 1.44305, labelSide: "left", zones: CITY },
  { nom: "St-Sernin", icon: "basilique", lat: 43.60851, lon: 1.44206, labelSide: "left", zones: CITY },
  { nom: "Pont Neuf", icon: "pont", lat: 43.59923, lon: 1.43853, labelSide: "left", rotate: -29, zones: ["toulouse"] },
  { nom: "Stadium", icon: "stade", lat: 43.582, lon: 1.4358, labelSide: "left", zones: CITY },
  { nom: "Zénith", icon: "zenith", lat: 43.6013, lon: 1.4103, labelSide: "left", zones: ["toulouse"] },
  // L'aéroport est hors du cadre ville
  { nom: "Aéroport", icon: "avion", lat: 43.6291, lon: 1.3639, labelSide: "left", zones: ["metropole", "all"] },
];

// ---------------------------------------------------------------------------
// Construction d'une vue : projection, lissage et éléments projetés
// ---------------------------------------------------------------------------

interface Bounds {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface MetroLine {
  id: "A" | "B";
  path: string;
  stops: (Point & { nom: string })[];
  badges: [Point, Point];
}

export interface Monument {
  nom: string;
  icon: MonumentIcon;
  point: Point;
  labelSide: "left" | "right";
  rotate?: number;
}

export interface MapRiver {
  d: string;
  /** Largeur de trait en unités de viewBox — la Garonne domine les canaux. */
  width: number;
}

export interface MapView {
  width: number;
  height: number;
  rivers: MapRiver[];
  metro: MetroLine[];
  monuments: Monument[];
  project: (c: LatLon) => Point;
}

/** Marge qui garde les pastilles « A » / « B » entièrement dans le cadre. */
const BADGE_MARGIN = 22;

const VIEW_WIDTH = 1000;

function buildView(zone: ZoneFilter, bounds: Bounds, opts: { wide: boolean }): MapView {
  /** Un degré de longitude est plus court qu'un degré de latitude à cette latitude. */
  const lonScale = Math.cos(((bounds.latMin + bounds.latMax) / 2) * (Math.PI / 180));
  const width = VIEW_WIDTH;
  const height = Math.round(
    (width * (bounds.latMax - bounds.latMin)) / ((bounds.lonMax - bounds.lonMin) * lonScale)
  );

  /** Projection équirectangulaire : suffisante et sans distorsion visible à cette échelle. */
  const project = ({ lat, lon }: LatLon): Point => ({
    x: ((lon - bounds.lonMin) / (bounds.lonMax - bounds.lonMin)) * width,
    y: ((bounds.latMax - lat) / (bounds.latMax - bounds.latMin)) * height,
  });

  /**
   * Courbe de Catmull-Rom convertie en Béziers cubiques : la ligne brisée des
   * points relevés devient un cours d'eau lisse.
   */
  const smoothPath = (coords: LatLon[]): string => {
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
  };

  const clampToFrame = (p: Point): Point => ({
    x: Math.min(Math.max(p.x, BADGE_MARGIN), width - BADGE_MARGIN),
    y: Math.min(Math.max(p.y, BADGE_MARGIN), height - BADGE_MARGIN),
  });

  /**
   * Position de la pastille de terminus : sur le terminus s'il est visible,
   * sinon là où la ligne sort du cadre (en vue ville, Borderouge et Ramonville
   * sont hors plan).
   */
  const badgePoint = (stations: MetroStation[], fromEnd: boolean): Point => {
    const pts = stations.map(project);
    const ordered = fromEnd ? [...pts].reverse() : pts;
    const inFrame = (p: Point) =>
      p.x >= BADGE_MARGIN &&
      p.x <= width - BADGE_MARGIN &&
      p.y >= BADGE_MARGIN &&
      p.y <= height - BADGE_MARGIN;
    const i = ordered.findIndex(inFrame);
    if (i <= 0) return clampToFrame(ordered[0]);
    const a = ordered[i];
    const b = ordered[i - 1];
    let t = 1;
    if (b.x < BADGE_MARGIN) t = Math.min(t, (a.x - BADGE_MARGIN) / (a.x - b.x));
    if (b.x > width - BADGE_MARGIN) t = Math.min(t, (width - BADGE_MARGIN - a.x) / (b.x - a.x));
    if (b.y < BADGE_MARGIN) t = Math.min(t, (a.y - BADGE_MARGIN) / (a.y - b.y));
    if (b.y > height - BADGE_MARGIN) t = Math.min(t, (height - BADGE_MARGIN - a.y) / (b.y - a.y));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  // Traits plus fins sur les vues larges : mêmes unités de viewBox, mais
  // chaque unité couvre plus de terrain — sinon la Garonne ferait 500 m de large.
  const w = (city: number) => (opts.wide ? Math.round(city * 0.6) : city);
  const rivers: MapRiver[] = [
    {
      d: smoothPath(
        opts.wide ? [...GARONNE_SOUTH, ...GARONNE, ...GARONNE_NORTH] : GARONNE
      ),
      width: w(26),
    },
    { d: smoothPath(opts.wide ? [...CANAL, ...CANAL_SOUTH] : CANAL), width: w(11) },
    { d: smoothPath(BRIENNE), width: w(8) },
    { d: smoothPath(opts.wide ? [...LATERAL, ...LATERAL_NORTH] : LATERAL), width: w(9) },
    ...(opts.wide ? [{ d: smoothPath(TOUCH), width: w(10) }] : []),
  ];

  const metro: MetroLine[] = [
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
      stops: METRO_B.filter((s) => s.nom !== "Jean Jaurès").map((s) => ({
        nom: s.nom,
        ...project(s),
      })),
      badges: [badgePoint(METRO_B, false), badgePoint(METRO_B, true)],
    },
  ];

  const monuments: Monument[] = MONUMENT_DEFS.filter((m) => m.zones.includes(zone)).map(
    ({ lat, lon, zones: _, ...m }) => ({ ...m, point: project({ lat, lon }) })
  );

  return { width, height, rivers, metro, monuments, project };
}

/**
 * Cadres des trois vues, marge comprise. Ville = le cadre historique ;
 * métropole = jusqu'à Colomiers, Balma, Saint-Alban et Launaguet ; aire
 * urbaine = jusqu'à Léguevin et Plaisance-du-Touch à l'ouest.
 */
const VIEW_BOUNDS: Record<ZoneFilter, Bounds> = {
  toulouse: { latMin: 43.558, latMax: 43.633, lonMin: 1.39, lonMax: 1.484 },
  metropole: { latMin: 43.554, latMax: 43.69, lonMin: 1.32, lonMax: 1.514 },
  all: { latMin: 43.548, latMax: 43.69, lonMin: 1.218, lonMax: 1.514 },
};

export const MAP_VIEWS: Record<ZoneFilter, MapView> = {
  toulouse: buildView("toulouse", VIEW_BOUNDS.toulouse, { wide: false }),
  metropole: buildView("metropole", VIEW_BOUNDS.metropole, { wide: true }),
  all: buildView("all", VIEW_BOUNDS.all, { wide: true }),
};

/**
 * Plus petite vue dont le cadre contient toutes les piscines demandées : la
 * carte s'adapte à ce qui est affiché (favoris éparpillés → vue large, filtre
 * ramené au centre-ville → vue ville, plus détaillée). Une piscine sans
 * coordonnées ne contraint rien — elle n'est pas sur le plan.
 */
export function fitView(slugs: string[]): ZoneFilter {
  for (const zone of ["toulouse", "metropole", "all"] as const) {
    const b = VIEW_BOUNDS[zone];
    const fits = slugs.every((slug) => {
      const c = POOL_COORDS[slug];
      return (
        !c || (c.lat >= b.latMin && c.lat <= b.latMax && c.lon >= b.lonMin && c.lon <= b.lonMax)
      );
    });
    if (fits) return zone;
  }
  return "all";
}

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
  // Vues larges : Hersain et Vauchère à gauche (voisins de Launaguet et du
  // bord ouest), Balma à gauche (bord est du cadre).
  "espace-nautique-jean-vauchere": "right",
  "complexe-nautique-des-ramiers": "right",
  "piscine-balma": "left",
  "piscine-launaguet": "right",
  "piscine-hersain": "left",
  "piscine-oasis-de-la-ramee": "right",
  "piscine-plaisance-du-touch": "left",
  "piscine-leguevin": "right",
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
export function groupSites(slugs: string[], zone: ZoneFilter = "toulouse"): MapSite[] {
  const { project } = MAP_VIEWS[zone];
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
