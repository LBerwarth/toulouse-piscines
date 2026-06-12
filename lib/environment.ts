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
