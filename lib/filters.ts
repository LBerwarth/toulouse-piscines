import type { Environment } from "./environment";
import type { BasinLength, PoolZone } from "./pools";

// Filtres combinables : secteur × emplacement × longueur de bassin × ouverture × favoris.
/**
 * Secteur : filtre emboîté, pas exclusif — « metropole » garde aussi Toulouse,
 * « all » ajoute les communes de l'aire urbaine hors métropole.
 */
export type ZoneFilter = "toulouse" | "metropole" | "all";

/** Secteurs gardés par chaque cran du filtre. */
export const ZONES_KEPT: Record<ZoneFilter, PoolZone[]> = {
  toulouse: ["toulouse"],
  metropole: ["toulouse", "metropole"],
  all: ["toulouse", "metropole", "alentours"],
};

export type EnvFilter = "all" | Environment;
export type LengthFilter = "all" | BasinLength;
export type OpenFilter = "all" | "now" | "today";

export type FilterPreset = {
  zone: ZoneFilter;
  env: EnvFilter;
  length: LengthFilter;
  open: OpenFilter;
  fav: boolean;
};

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Cookie mémorisant les filtres d'une visite à l'autre. Cookie et non
 * localStorage : le serveur le lit au premier rendu, donc la liste arrive déjà
 * filtrée — pas de bascule visible après hydratation.
 */
export const FILTER_COOKIE = "filtres";

/** Un an : le choix de secteur est une préférence durable, pas une session. */
const FILTER_COOKIE_MAX_AGE = 31_536_000;

/** Filtres → paramètres, dans le vocabulaire de readFilterPreset. */
export function filterParams(f: FilterPreset): Record<string, string> {
  return {
    secteur: f.zone === "all" ? "tout" : f.zone,
    type: f.env === "indoor" ? "interieur" : f.env === "outdoor" ? "pleinair" : "toutes",
    longueur: f.length === "all" ? "toutes" : String(f.length),
    ouvert: f.open === "now" ? "maintenant" : f.open === "today" ? "aujourdhui" : "toutes",
    favoris: f.fav ? "1" : "0",
  };
}

export function serializeFilterCookie(f: FilterPreset): string {
  return new URLSearchParams(filterParams(f)).toString();
}

export function parseFilterCookie(value: string | undefined): Params {
  if (!value) return {};
  return Object.fromEntries(new URLSearchParams(value));
}

/** Écrit le cookie côté client, à chaque changement de filtre. */
export function persistFilters(f: FilterPreset): void {
  document.cookie = `${FILTER_COOKIE}=${serializeFilterCookie(f)}; path=/; max-age=${FILTER_COOKIE_MAX_AGE}; samesite=lax`;
}

/** Filtres préréglés par les raccourcis du lanceur Android (cf. twa-manifest.json). */
export function readFilterPreset(params: Params): FilterPreset {
  const zone = one(params.secteur);
  const env = one(params.type);
  const length = one(params.longueur);
  const open = one(params.ouvert);
  return {
    // Défaut « metropole » : les piscines de Toulouse ET des communes membres.
    zone: zone === "toulouse" ? "toulouse" : zone === "tout" ? "all" : "metropole",
    env: env === "interieur" ? "indoor" : env === "pleinair" ? "outdoor" : "all",
    length: length === "25" ? 25 : length === "50" ? 50 : "all",
    open: open === "maintenant" ? "now" : open === "aujourdhui" ? "today" : "all",
    fav: one(params.favoris) === "1",
  };
}
