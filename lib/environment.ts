import type { PoolEnv } from "./pools";

/** Filtre intérieur/extérieur. */
export type Environment = "indoor" | "outdoor";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Classe un bassin en intérieur / extérieur d'après son libellé. Utilisé pour
 * les piscines « mixtes » (Bellevue, Toulouse Lautrec) dont les bassins sont
 * explicitement nommés « … intérieurs » / « … extérieurs / nordiques ».
 * Renvoie null si le libellé ne permet pas de trancher.
 */
export function classifyBasinEnv(label: string | null): Environment | null {
  const n = norm(label ?? "");
  if (/exterieur|nordique|plein air|decouvert/.test(n)) return "outdoor";
  if (/interieur|halle|couvert/.test(n)) return "indoor";
  return null;
}

/** La piscine possède-t-elle au moins un bassin du type demandé ? */
export function poolHasEnv(poolEnv: PoolEnv, target: Environment): boolean {
  return poolEnv === "mixed" || poolEnv === target;
}

/**
 * Bassin « annexe » d'après son libellé : petit bassin, pataugeoire, fosse,
 * bassin d'apprentissage ou ludique — jamais aux normes 25/50 m. Le filtre
 * longueur les écarte pour ne pas afficher leurs créneaux comme ceux d'un
 * bassin de nage. Un libellé null (bassin principal) n'est pas une annexe.
 */
export function isAnnexBasin(label: string | null): boolean {
  return /petit bassin|pataugeoire|fosse|apprentissage|ludique/.test(norm(label ?? ""));
}
