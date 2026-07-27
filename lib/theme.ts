export type Theme = "system" | "light" | "dark";

/** Teinte de la barre d'adresse, par thème résolu. */
export const THEME_COLOR = { light: "#6D28D9", dark: "#2E1065" } as const;

export const THEME_STORAGE_KEY = "theme";

/**
 * Posé dans le <head> et exécuté pendant l'analyse du HTML, donc avant la
 * première peinture : sans lui, un thème forcé s'appliquerait après le rendu
 * du thème système (clignotement). L'absence de data-theme = suivre l'OS.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
