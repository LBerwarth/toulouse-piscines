import type { Environment } from "./environment";
import type { BasinLength } from "./pools";

// Filtres combinables : emplacement × longueur de bassin × ouverture × favoris.
export type EnvFilter = "all" | Environment;
export type LengthFilter = "all" | BasinLength;
export type OpenFilter = "all" | "now" | "today";

export type FilterPreset = {
  env: EnvFilter;
  length: LengthFilter;
  open: OpenFilter;
  fav: boolean;
};

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Filtres préréglés par les raccourcis du lanceur Android (cf. twa-manifest.json). */
export function readFilterPreset(params: Params): FilterPreset {
  const env = one(params.type);
  const length = one(params.longueur);
  const open = one(params.ouvert);
  return {
    env: env === "interieur" ? "indoor" : env === "pleinair" ? "outdoor" : "all",
    length: length === "25" ? 25 : length === "50" ? 50 : "all",
    open: open === "maintenant" ? "now" : open === "aujourdhui" ? "today" : "all",
    fav: one(params.favoris) === "1",
  };
}
