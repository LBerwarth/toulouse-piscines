import { POOLS } from "./pools";

/**
 * Tarifs d'entrée, relevés une fois sur la page officielle de chaque
 * équipement et figés : les prix changent au plus une fois par an, et les
 * extraire automatiquement de neuf sites de mairie sans structure commune
 * serait bien plus fragile que de les vérifier. Le contrôle mensuel
 * (cf. app/api/cron/sanity) s'assure que les montants relevés figurent
 * toujours sur la page source — une divergence déclenche une alerte, jamais
 * une mise à jour silencieuse.
 */

export interface TarifEntry {
  label: string;
  prix: string;
}

export interface PoolTarifs {
  entries: TarifEntry[];
  /** Gratuités et conditions, en une ligne. */
  note?: string;
  /** Page officielle où les prix ont été relevés. */
  source: string;
  /** Date du relevé (AAAA-MM-JJ). */
  releve: string;
  /**
   * Chaînes dont le contrôle mensuel exige la présence sur `source`
   * (telles quelles, séparateur décimal compris). Absent = source papier
   * (affiche en mairie), invérifiable automatiquement.
   */
  verify?: string[];
}

/** Tarif unique des 12 piscines municipales de Toulouse (page « Billetterie »). */
const TOULOUSE: PoolTarifs = {
  // Deux montants séparés d'une barre = Toulousains / non-Toulousains.
  entries: [
    { label: "Toulousains", prix: "3,40 €" },
    { label: "non-Toulousains", prix: "4,40 €" },
    { label: "moins de 25 ans", prix: "1,50 €" },
    { label: "carnet 10 entrées", prix: "25,50 / 33 €" },
    { label: "abonnement annuel", prix: "129 / 167,50 €" },
  ],
  note: "Abonnement annuel moins de 25 ans : 25 €. Gratuit pour les moins de 10 ans, les seniors retraités toulousains (carte) et les Toulousains en situation de handicap.",
  source: "https://metropole.toulouse.fr/annuaire/piscine-alban-minville",
  releve: "2026-08-22",
  // La page écrit les montants avec un point (« 3.40 € »).
  verify: ["3.40", "4.40", "1.50", "25.50", "167.50"],
};

const PAR_PISCINE: Record<string, PoolTarifs> = {
  "espace-nautique-jean-vauchere": {
    entries: [
      { label: "adulte", prix: "4,80 €" },
      { label: "réduit (3-15 ans, étudiants…)", prix: "3,60 €" },
      { label: "carnet 10 entrées", prix: "37 / 47 €" },
      { label: "abonnement annuel", prix: "210 / 290 €" },
    ],
    note: "Gratuit pour les moins de 3 ans. Deux montants = Columérins / extérieurs.",
    source: "https://www.espacenautique-colomiers.com/infos-pratiques/tarifs",
    releve: "2026-08-22",
    verify: ["4,80", "3,60"],
  },
  "complexe-nautique-des-ramiers": {
    entries: [
      { label: "adulte", prix: "4,40 €" },
      { label: "moins de 10 ans", prix: "2,40 €" },
      { label: "carte 10 entrées", prix: "34 / 39 €" },
      { label: "carte annuelle", prix: "250 / 300 €" },
    ],
    note: "Gratuit pour les moins de 3 ans. Deux montants = Blagnacais / extérieurs.",
    source: "https://www.mairie-blagnac.fr/piscine-des-ramiers-et-activites",
    releve: "2026-08-22",
    verify: ["4,40", "2,40"],
  },
  "piscine-balma": {
    entries: [
      { label: "Balmanais", prix: "3,55 €" },
      { label: "extérieurs", prix: "6 €" },
      { label: "enfants, étudiants…", prix: "1,80 €" },
      { label: "carte 15 entrées", prix: "44 / 61 €" },
      { label: "carte annuelle", prix: "131 / 160 €" },
    ],
    note: "Gratuit pour les moins de 5 ans. Deux montants = Balmanais / extérieurs.",
    // Relevé sur l'affiche de la mairie (HorairesPISCINE_sept2026_bis.jpg) —
    // image illisible au scrape, donc pas de contrôle automatique possible.
    source: "https://www.mairie-balma.fr/contacts/piscine-municipale/",
    releve: "2026-08-22",
  },
  "piscine-launaguet": {
    entries: [
      { label: "adultes Launaguet", prix: "3,60 €" },
      { label: "adultes extérieurs", prix: "4,50 €" },
      { label: "enfants (2-17 ans)", prix: "2,30 / 2,90 €" },
      { label: "carnet 12 entrées adultes", prix: "36 / 45 €" },
    ],
    note: "Gratuit pour les moins de 2 ans. Deux montants = Launaguet / extérieurs.",
    source: "https://www.mairie-launaguet.fr/ouverture-de-la-piscine-dete/",
    releve: "2026-08-22",
    verify: ["3,60", "4,50", "2,30", "2,90"],
  },
  "piscine-hersain": {
    entries: [
      { label: "résidents Hersain-Bocage", prix: "3,40 €" },
      { label: "extérieurs", prix: "5,00 €" },
      { label: "enfants (2-13 ans)", prix: "1,90 / 2,90 €" },
      { label: "carnet 12 entrées", prix: "34 / 50 €" },
    ],
    note: "Gratuit pour les moins de 2 ans. Deux montants = communes Hersain-Bocage / extérieurs.",
    source: "https://www.hersain-bocage.fr/fr/le-syndicat-intercommunal/piscine/",
    releve: "2026-08-22",
    // La page écrit les montants avec un point (« 3.40 € »).
    verify: ["3.40", "5.00", "1.90", "2.90"],
  },
  "piscine-oasis-de-la-ramee": {
    entries: [
      { label: "adulte", prix: "4,60 €" },
      { label: "réduit (–16 ans, étudiants…)", prix: "4,10 €" },
      { label: "MDPH", prix: "2,50 €" },
      { label: "carte 10 entrées", prix: "36 €" },
    ],
    note: "Gratuit pour les moins de 3 ans.",
    source: "https://www.loasisdelaramee.fr/infos-pratiques/horaires-d-ouverture-au-public.html",
    releve: "2026-08-22",
    verify: ["4,60", "4,10", "2,50"],
  },
  "piscine-leguevin": {
    entries: [
      { label: "adultes Léguevinois", prix: "4 €" },
      { label: "adultes extérieurs", prix: "5 €" },
      { label: "enfants, seniors", prix: "3 / 4 €" },
    ],
    note: "Gratuit pour les moins de 3 ans et les personnes en situation de handicap.",
    source: "https://www.ville-leguevin.fr/vivre-a-leguevin/culture-loisirs/piscine-municipale/",
    releve: "2026-08-22",
    // Des montants à un chiffre (« 4 € ») ne sont pas discriminants : on
    // contrôle l'en-tête du barème — un « Tarifs 2027 » le fera disparaître.
    verify: ["Tarifs 2026", "Léguevinois"],
  },
  // Plaisance-du-Touch : la mairie ne publie pas ses tarifs en ligne (les
  // montants des annuaires tiers ne sont pas repris ici). À relever sur place.
};

/** Tarifs d'une piscine, ou null si la source officielle n'en publie pas. */
export function poolTarifs(slug: string): PoolTarifs | null {
  const pool = POOLS.find((p) => p.slug === slug);
  if (!pool) return null;
  if (pool.zone === "toulouse") return TOULOUSE;
  return PAR_PISCINE[slug] ?? null;
}

/** Sources distinctes à contrôler chaque mois : URL → chaînes attendues. */
export function tarifVerifications(): { source: string; expect: string[] }[] {
  const all = [TOULOUSE, ...Object.values(PAR_PISCINE)];
  return all
    .filter((t): t is PoolTarifs & { verify: string[] } => t.verify !== undefined)
    .map((t) => ({ source: t.source, expect: t.verify }));
}
