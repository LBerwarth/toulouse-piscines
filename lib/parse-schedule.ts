import type { PageSections, SectionLine, ShortNews } from "./scrape";
import type { TodayInfo } from "./today";
import { classifyBasinEnv } from "./environment";

export interface TimeSlot {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface BasinSchedule {
  /** null = bassin unique ou non nommé */
  label: string | null;
  /** Créneaux du jour pour ce bassin (vide si fermé) */
  slots: TimeSlot[];
  /** Raison de fermeture ou restriction du bassin, le cas échéant */
  note: string | null;
}

export interface DayStatus {
  openToday: boolean;
  /** Union de tous les bassins (créneaux fusionnés) */
  slotsToday: TimeSlot[];
  closureReason: string | null;
  alerts: string[];
  confidence: "high" | "low";
  /** Détail par bassin quand la page distingue plusieurs bassins */
  basins: BasinSchedule[];
  /**
   * Actualités « En bref » concernant cette piscine ce jour-là (canicule,
   * extensions d'horaires…). Affichées en bandeau et poussées en notification.
   */
  announcements: Announcement[];
  /**
   * Heure de fermeture « HH:MM » repoussée par une actu « En bref » ce jour-là,
   * lorsqu'elle dépasse réellement l'horaire habituel publié (sinon null). Sert
   * à signaler, dans la grille publiée, que l'horaire du jour est modifié.
   */
  extendedTo?: string | null;
}

/** Une actualité « En bref » affichée en bandeau : titre + corps détaillé. */
export interface Announcement {
  /** Titre de l'actu (h3) — sert aussi de clé pour la notification push */
  title: string;
  /** Corps de l'actu (mesures, tarifs, dates…) ou null s'il est vide */
  detail: string | null;
}

const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];
const MONTH_RE = MONTHS.join("|");

/**
 * Découpe un texte en phrases : ponctuation forte, ou saut de ligne — les \n
 * marquent les frontières de blocs HTML (cf. blockText), et la mairie publie ses
 * bandeaux d'avis sans point final (« Fermeture estivale le 4 juillet 2026 »).
 */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!])\s+|\n/);
}

/** minuscules + sans accents, pour des regex simples */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ---------------------------------------------------------------------------
// Heures : « de 9h30 à 20h30 », « 12h - 19h », « 9h - 10h30 / 12h - 14h »
// ---------------------------------------------------------------------------

function fmt(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** « 21:00 » → « 21h », « 20:30 » → « 20h30 » (libellé d'annonce lisible). */
function closeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

export function parseTimeRanges(line: string): TimeSlot[] {
  const t = norm(line);
  const re = /(\d{1,2})\s*h\s*([0-5]\d)?\s*(?:a|-|–|—)\s*(\d{1,2})\s*h\s*([0-5]\d)?/g;
  const slots: TimeSlot[] = [];
  for (const m of t.matchAll(re)) {
    const h1 = Number(m[1]);
    const min1 = Number(m[2] ?? 0);
    const h2 = Number(m[3]);
    const min2 = Number(m[4] ?? 0);
    if (h1 > 24 || h2 > 24) continue;
    if (h1 * 60 + min1 >= h2 * 60 + min2) continue;
    slots.push({ start: fmt(h1, min1), end: fmt(h2, min2) });
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Jours : « du lundi au vendredi », « samedi et dimanche », « le dimanche »,
// « Mardi : … », « tous les jours », « week-end »
// ---------------------------------------------------------------------------

export function parseDays(line: string): Set<number> | null {
  const t = norm(line);
  const days = new Set<number>();

  if (/tous les jours/.test(t)) {
    for (let i = 0; i < 7; i++) days.add(i);
    return days;
  }

  const range = t.match(
    /du\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+au\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/
  );
  if (range) {
    const from = DAY_NAMES.indexOf(range[1]);
    const to = DAY_NAMES.indexOf(range[2]);
    for (let i = from; ; i = (i + 1) % 7) {
      days.add(i);
      if (i === to) break;
    }
  }

  DAY_NAMES.forEach((name, i) => {
    if (new RegExp(`\\b${name}s?\\b`).test(t)) days.add(i);
  });
  if (/week-?end/.test(t)) {
    days.add(5);
    days.add(6);
  }
  if (/\ben semaine\b/.test(t)) {
    for (let i = 0; i < 5; i++) days.add(i);
  }

  return days.size > 0 ? days : null;
}

// ---------------------------------------------------------------------------
// Périodes : « du 5 juin au 5 juillet », « du 24 au 30 août »,
// « à compter du 5 juin 2026 », « jusqu'au 31 mai »
// ---------------------------------------------------------------------------

interface DateRange {
  from: number; // AAAAMMJJ, 0 = ouvert
  to: number; // AAAAMMJJ, 99999999 = ouvert
}

function dateKey(year: number, monthIdx: number, day: number): number {
  return year * 10000 + (monthIdx + 1) * 100 + day;
}

export function parseDateRange(text: string, refYear: number): DateRange | null {
  const t = norm(text);
  // Jour de semaine optionnel devant une date (« du lundi 29 juin au vendredi
  // 3 juillet »). Groupe non capturant : les index des captures sont inchangés.
  const wd = `(?:(?:${DAY_NAMES.join("|")})\\s+)?`;

  // du (lundi)? 5 juin (2026)? au (vendredi)? 5 juillet (2026)?
  let m = t.match(
    new RegExp(
      `du\\s+${wd}(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?\\s+au\\s+${wd}(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`
    )
  );
  if (m) {
    const y1 = m[3] ? Number(m[3]) : refYear;
    let y2 = m[6] ? Number(m[6]) : y1;
    const from = dateKey(y1, MONTHS.indexOf(m[2]), Number(m[1]));
    let to = dateKey(y2, MONTHS.indexOf(m[5]), Number(m[4]));
    if (to < from && !m[6]) {
      // période à cheval sur deux années (ex. « du 1er septembre au 30 juin »)
      y2 += 1;
      to = dateKey(y2, MONTHS.indexOf(m[5]), Number(m[4]));
    }
    return { from, to };
  }

  // du (lundi)? 24 au (mercredi)? 30 août (2026)? — mois partagé
  m = t.match(
    new RegExp(`du\\s+${wd}(\\d{1,2})(?:er)?\\s+au\\s+${wd}(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`)
  );
  if (m) {
    const y = m[4] ? Number(m[4]) : refYear;
    const monthIdx = MONTHS.indexOf(m[3]);
    return { from: dateKey(y, monthIdx, Number(m[1])), to: dateKey(y, monthIdx, Number(m[2])) };
  }

  // à compter du / à partir du / dès le / depuis le 5 juin (2026)? —
  // éventuellement combiné avec « jusqu'au 30 août (2026)? » dans la même phrase.
  const fromM = t.match(
    new RegExp(
      `(?:a compter du|a partir du|des le|depuis le)\\s+${wd}(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`
    )
  );
  const toM = t.match(new RegExp(`jusqu'?au\\s+${wd}(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`));
  if (fromM || toM) {
    const from = fromM
      ? dateKey(fromM[3] ? Number(fromM[3]) : refYear, MONTHS.indexOf(fromM[2]), Number(fromM[1]))
      : 0;
    const to = toM
      ? dateKey(toM[3] ? Number(toM[3]) : refYear, MONTHS.indexOf(toM[2]), Number(toM[1]))
      : 99999999;
    return { from, to };
  }

  return null;
}

/**
 * Dates énumérées (« mardi 28 et mercredi 29 juillet », « le samedi 20 juin »)
 * → clés AAAAMMJJ triées. Le mois et l'année manquants sont repris de l'élément
 * voisin qui les porte : la mairie ne les écrit qu'une fois, en fin
 * d'énumération. Dates exactes et non plage — « le 1er et le 9 août » ne
 * concerne pas les jours entre les deux.
 */
export function parseDateList(text: string, refYear: number): number[] | null {
  const t = norm(text);
  const wd = DAY_NAMES.join("|");
  const item = `(?:(?:le|les|ce|ces)\\s+)?(?:(?:${wd})\\s+)?(?<!\\d)(\\d{1,2})(?!\\d)(?:er)?(?:\\s+(${MONTH_RE}))?(?:\\s+(\\d{4}))?`;
  // L'énumération doit être amorcée par « le/les/ce/ces » ou un jour de semaine,
  // sinon n'importe quel nombre du texte deviendrait une date. Les plages
  // continues (« du 5 juin au 5 juillet ») sont exclues : cf. parseDateRange.
  const chain = t.match(
    new RegExp(
      `(?<!\\bdu\\s)(?<!\\bau\\s)(?:le|les|ce|ces|${wd})\\s+${item}(?:\\s*(?:,|et|&)\\s*${item})*`
    )
  );
  if (!chain) return null;

  const items = [...chain[0].matchAll(new RegExp(item, "g"))].map((m) => ({
    day: Number(m[1]),
    month: m[2] ? MONTHS.indexOf(m[2]) : null,
    year: m[3] ? Number(m[3]) : null,
  }));
  for (let i = items.length - 2; i >= 0; i--) {
    if (items[i].month === null) {
      items[i].month = items[i + 1].month;
      items[i].year = items[i + 1].year;
    }
  }
  for (let i = 1; i < items.length; i++) {
    if (items[i].month === null) {
      items[i].month = items[i - 1].month;
      items[i].year = items[i - 1].year;
    }
  }

  const keys = items
    .filter((it) => it.month !== null && it.day >= 1 && it.day <= 31)
    .map((it) => dateKey(it.year ?? refYear, it.month!, it.day));
  return keys.length > 0 ? [...new Set(keys)].sort((a, b) => a - b) : null;
}

/** Jours d'application d'une annonce : plage continue ou dates énumérées. */
type DateScope = DateRange | number[];

/** Jours visés par un texte daté, quelle que soit la tournure employée. */
function datedScope(text: string, refYear: number): DateScope | null {
  return parseDateRange(text, refYear) ?? parseDateList(text, refYear);
}

/** L'annonce vaut-elle ce jour-là ? Sans date, elle vaut tous les jours. */
function coversDay(scope: DateScope | null, dateKey: number): boolean {
  if (!scope) return true;
  return Array.isArray(scope)
    ? scope.includes(dateKey)
    : dateKey >= scope.from && dateKey <= scope.to;
}

/** Dernier jour couvert — distingue une annonce passée d'une annonce à venir. */
function scopeEnd(scope: DateScope): number {
  return Array.isArray(scope) ? Math.max(...scope) : scope.to;
}

// ---------------------------------------------------------------------------
// Blocs de période : une section accordéon, éventuellement découpée par des
// sous-titres datés (« Du 5 juin au 5 juillet »)
// ---------------------------------------------------------------------------

type PeriodType = "school" | "vacation" | null;

interface PeriodBlock {
  range: DateRange | null;
  periodType: PeriodType;
  rules: string[];
  /**
   * Bloc « Horaires d'été » (distinct de « vacances scolaires hors été ») : sert
   * à n'ouvrir un bassin estival (petit bassin extérieur) que sur cette période.
   */
  summer: boolean;
  /**
   * Grille de vacances qui exclut explicitement l'été : à écarter en juillet /
   * août (cf. excludesSummerTitle).
   */
  excludesSummer: boolean;
}

function periodTypeOf(title: string): PeriodType {
  const t = norm(title);
  if (/vacances|estival|ete\b/.test(t)) return "vacation";
  if (/scolaire/.test(t)) return "school";
  return null;
}

/**
 * Section « Horaires d'été » — hors « vacances scolaires (hors été) », qui n'est
 * pas la saison estivale au sens des bassins de plein air.
 */
function isSummerTitle(title: string): boolean {
  const t = norm(title);
  return /\bete\b|estival/.test(t) && !/hors\s*ete/.test(t) && !/vacances/.test(t);
}

/**
 * Grille de vacances qui ne décrit PAS les vacances d'été : la mairie publie
 * « vacances scolaires (hors été) », « vacances scolaires automne et hiver »…
 * En juillet / août elle ne couvre pas la période en cours, et la servir
 * afficherait de faux horaires — typiquement une piscine d'hiver fermée l'été
 * dont la grille scolaire datée a expiré.
 */
function excludesSummerTitle(title: string): boolean {
  const t = norm(title);
  return /vacances/.test(t) && /hors\s*ete|automne|hiver|printemps|toussaint|noel|fevrier/.test(t);
}

/** Juillet–août : les vacances d'été. */
function isSummerMonth(today: TodayInfo): boolean {
  const month = Math.floor(today.dateKey / 100) % 100;
  return month === 7 || month === 8;
}

/**
 * Une ligne qui n'est qu'une plage de dates (« Du 5 juin au 5 juillet ») agit
 * comme sous-titre de période. Les annonces de fermeture datées (« Fermeture à
 * compter du 6 juin… ») n'en sont PAS : ce sont des règles de fermeture.
 */
function isDateOnlyLine(line: string, refYear: number): boolean {
  return (
    parseDateRange(line, refYear) !== null &&
    parseTimeRanges(line).length === 0 &&
    !/ferm/.test(norm(line))
  );
}

function buildBlocks(
  sections: { title: string; lines: SectionLine[] }[],
  refYear: number
): PeriodBlock[] {
  const blocks: PeriodBlock[] = [];
  for (const section of sections) {
    if (!/horaire|ouverture|periode/.test(norm(section.title))) continue;
    const sectionRange = parseDateRange(section.title, refYear);
    const periodType = periodTypeOf(section.title);
    const summer = isSummerTitle(section.title);
    const excludesSummer = excludesSummerTitle(section.title);

    let current: PeriodBlock = { range: sectionRange, periodType, rules: [], summer, excludesSummer };
    blocks.push(current);

    for (const line of section.lines) {
      const n = norm(line.text);
      // Sous-titre daté (« Du 5 juin au 5 juillet ») → nouvelle sous-période.
      // (Les étiquettes de bassin en <h4> restent des règles.)
      const candidateHeading =
        (line.kind === "heading" && !/ferm/.test(n)) || isDateOnlyLine(line.text, refYear);
      const headingRange = candidateHeading ? parseDateRange(line.text, refYear) : null;

      // Étiquette de sous-grille au sein d'une même section (« Horaires
      // habituels en période scolaire », « Horaires exceptionnels vague de
      // chaleur… ») : sépare deux grilles distinctes. Sans heures, avec un type
      // de période ou une date reconnus — sinon ce serait une règle.
      const labelType = periodTypeOf(line.text);
      const labelRange = parseDateRange(line.text, refYear);
      const isScheduleLabel =
        !headingRange &&
        /^horaires?\b/.test(n) &&
        parseTimeRanges(line.text).length === 0 &&
        !/ferm/.test(n) &&
        (labelType !== null || labelRange !== null || /habituel|exceptionnel|chaleur|canicule/.test(n));

      if (headingRange) {
        current = { range: headingRange, periodType, rules: [], summer, excludesSummer };
        blocks.push(current);
      } else if (isScheduleLabel) {
        current = { range: labelRange, periodType: labelType, rules: [], summer, excludesSummer };
        blocks.push(current);
      } else {
        current.rules.push(line.text);
      }
    }
  }
  return blocks.filter((b) => b.rules.length > 0);
}

function spanOf(range: DateRange | null): number {
  if (!range) return Number.MAX_SAFE_INTEGER;
  return range.to - range.from;
}

// ---------------------------------------------------------------------------
// Alertes et fermetures exceptionnelles
// ---------------------------------------------------------------------------

// Uniquement les événements exceptionnels — pas les règles permanentes
// (canicule, matchs au Stadium…) ni les travaux déjà affichés par bassin.
const ALERT_KEYWORDS = [
  "fermeture exceptionnelle",
  "exceptionnellement",
  "probleme technique",
  "raison technique",
  "incident",
  "panne",
  "vidange",
  "greve",
  "mouvement social",
];

/** Phrases conditionnelles (« en cas de… », « lors des matchs… ») : info permanente, pas une alerte */
const CONDITIONAL_RE = /\b(en cas d|lors d|si la |si le |si vous )/;

// Volontairement SANS « fermeture estivale/hivernale » : ces bandeaux du bloc
// descriptif ne portent qu'une date de début, donc une fermeture sans fin, qui
// survivrait à la réouverture. Les fermetures saisonnières passent par « En
// bref » (cf. collectPoolNews), que la mairie retire à la réouverture.
const STRONG_CLOSURE_RE =
  /(fermeture exceptionnelle|exceptionnellement fermee?|fermee? (?:pour|en raison|suite a|jusqu)[^.]*|piscine (?:est |restera )?fermee)/;

function extractAlerts(texts: string[]): string[] {
  const alerts: string[] = [];
  for (const text of texts) {
    for (const sentence of sentences(text)) {
      const s = sentence.trim();
      if (!s || s.length > 300) continue;
      const n = norm(s);
      if (CONDITIONAL_RE.test(n)) continue;
      if (ALERT_KEYWORDS.some((k) => n.includes(k)) && !alerts.includes(s)) {
        alerts.push(s);
      }
    }
  }
  return alerts.slice(0, 6);
}

// Évènements exceptionnels uniquement — jamais les fermetures « normales »
// (jour de repos habituel). Couvre fermeture exceptionnelle, problème
// technique, vidange, panne, incident, grève, maintenance.
const EXCEPTIONAL_RE =
  /(ferm\w*\s+exceptionnel|exceptionnellement|probl[èe]me technique|raison technique|incident|panne|vidange|gr[èe]ve|mouvement social|maintenance)/i;

/**
 * Signature de l'évènement exceptionnel du jour pour une piscine (ou null si
 * aucun). Sert au cron de notifications pour ne pousser qu'au changement
 * d'état — et jamais pour une fermeture « normale » (jour de repos habituel).
 */
export function exceptionalSignature(day: DayStatus): string | null {
  const parts: string[] = [];
  if (day.closureReason && EXCEPTIONAL_RE.test(day.closureReason)) parts.push(day.closureReason);
  for (const alert of day.alerts) if (EXCEPTIONAL_RE.test(alert)) parts.push(alert);
  // Les actualités « En bref » concernant la piscine (canicule, extensions…)
  // sont par nature notifiables — elles ne passent pas par EXCEPTIONAL_RE.
  // La signature reste fondée sur le titre : changer le corps de l'actu ne
  // doit pas re-déclencher une notification déjà envoyée.
  for (const a of day.announcements ?? []) parts.push(a.title);
  if (parts.length === 0) return null;
  return [...new Set(parts)].join(" | ").slice(0, 300);
}

/**
 * Corps lisible de la notification : ce qui change pour la piscine, en clair.
 * Contrairement à `exceptionalSignature` (clé de déduplication, fondée sur les
 * titres), on y joint le DÉTAIL de chaque actu « En bref » (mesures, horaires,
 * dates) — c'est la vraie information attendue par l'abonné (« fermeture de 12h
 * à 14h », « extension canicule jusqu'à 20h »…). La piscine concernée est, elle,
 * le titre de la notification (`pool.name`, cf. cron).
 */
export function notificationBody(day: DayStatus): string {
  const annTitles = new Set((day.announcements ?? []).map((a) => norm(a.title)));
  const parts: string[] = [];
  // Fermeture exceptionnelle annoncée hors « En bref » (chapeau / encart).
  if (
    day.closureReason &&
    EXCEPTIONAL_RE.test(day.closureReason) &&
    !annTitles.has(norm(day.closureReason))
  ) {
    parts.push(day.closureReason);
  }
  // Actus « En bref » : titre + détail (la mesure réelle).
  for (const a of day.announcements ?? []) {
    parts.push(a.detail ? `${a.title} — ${a.detail}` : a.title);
  }
  // Alertes exceptionnelles de la grille non déjà couvertes par une actu.
  for (const alert of day.alerts) {
    if (EXCEPTIONAL_RE.test(alert) && !annTitles.has(norm(alert))) parts.push(alert);
  }
  const seen = new Set<string>();
  const unique = parts.filter((p) => {
    const k = norm(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.join(" · ").slice(0, 300) || "Changement signalé";
}

function findStrongClosure(texts: string[], today: TodayInfo): string | null {
  for (const text of texts) {
    for (const sentence of sentences(text)) {
      const n = norm(sentence);
      const m = n.match(STRONG_CLOSURE_RE);
      if (!m) continue;
      // Réouverture déjà annoncée → la fermeture est passée
      if (/rouvert|a rouvert|reouverture effectuee|s'est terminee/.test(n)) continue;
      // Fermeture datée (« jusqu'au 14 juin », « le samedi 20 juin ») :
      // ne s'applique qu'aux jours couverts — important pour la vue semaine.
      if (!coversDay(datedScope(sentence, today.year), today.dateKey)) continue;
      return sentence.trim().slice(0, 300);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Nettoyage des règles
// ---------------------------------------------------------------------------

// Pas de \b : les jours peuvent être collés à l'heure précédente (« 14hMardi : »)
const DAY_COLON_COUNT_RE = new RegExp(`(?:${DAY_NAMES.join("|")})\\s*:`, "gi");
const DAY_COLON_SPLIT_RE = new RegExp(`(?=(?:${DAY_NAMES.join("|")})\\s*:)`, "gi");

/**
 * Sépare une ligne fusionnée contenant plusieurs jours
 * (« Lundi : 12h - 14hMardi : ferméMercredi : … ») en une ligne par jour.
 */
export function splitMultiDay(line: string): string[] {
  const count = (norm(line).match(DAY_COLON_COUNT_RE) ?? []).length;
  if (count < 2) return [line];
  return line
    .split(DAY_COLON_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Retire les plages de fermeture partielle (« (petit bassin fermé de 17h à
 * 19h) ») pour qu'elles ne deviennent pas des créneaux d'ouverture, et les
 * renvoie comme notes.
 */
export function stripClosedRanges(line: string): { cleaned: string; notes: string[] } {
  const notes: string[] = [];
  let cleaned = line.replace(/\([^)]*\)/g, (m) => {
    if (/ferm/.test(norm(m))) {
      notes.push(m.replace(/^\(/, "").replace(/\)$/, "").trim());
      return " ";
    }
    return m;
  });
  cleaned = cleaned.replace(
    /ferm[ée]e?s?\s+de\s+\d{1,2}\s*h\s*(?:[0-5]\d)?\s*(?:à|a)\s*\d{1,2}\s*h\s*(?:[0-5]\d)?/gi,
    (m) => {
      notes.push(m.trim());
      return " ";
    }
  );
  return { cleaned, notes };
}

// ---------------------------------------------------------------------------
// Bassins
// ---------------------------------------------------------------------------

const BASIN_RE = /bassins?\b|pataugeoire|fosse/;

/**
 * Extrait une étiquette de bassin lisible : « Les bassins intérieurs sont
 * fermés » → « bassins intérieurs », « Bassin nordique uniquement de 10h à
 * 20h » → « Bassin nordique ».
 */
export function basinLabel(line: string): string {
  let label = line.replace(/\([^)]*\)/g, " ");
  const cut = label.search(/\b(uniquement|sont|est|reste|ferm|de\s+\d|\d{1,2}\s*h)/i);
  if (cut > 0) label = label.slice(0, cut);
  label = label
    .replace(/[*:]/g, " ")
    // « petit bassin de la piscine Léo Lagrange » → « petit bassin »
    .replace(/\s+de la piscine\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(les|le|la)\s+/i, "");
  return label.slice(0, 48);
}

export function mergeSlots(slots: TimeSlot[]): TimeSlot[] {
  const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
  const merged: TimeSlot[] = [];
  for (const slot of sorted) {
    const last = merged[merged.length - 1];
    if (last && slot.start <= last.end) {
      if (slot.end > last.end) last.end = slot.end;
    } else {
      merged.push({ ...slot });
    }
  }
  return merged;
}

/**
 * Détecte dans le chapeau / les encarts les bassins fermés pour travaux
 * (ex. Toulouse Lautrec : « …tandis que la halle et le bassin intérieur
 * fermaient pour rénovation »). La piscine reste ouverte ; le bassin concerné
 * apparaît comme fermé.
 */
export function detectClosedBasins(texts: string[]): { label: string; note: string }[] {
  const found: { label: string; note: string }[] = [];
  const clauseRe =
    /(?:^|[,;:]|tandis que|alors que)\s*((?:le |la |les |l')?[^,;.]{0,80}?bassins?[^,;.]{0,60}?)\s+(ferm\w*[^,;.]{0,80}|(?:est|sont|restent?)\s+en\s+travaux[^,;.]{0,40})/i;
  for (const text of texts) {
    for (const sentence of sentences(text)) {
      const n = norm(sentence);
      // Conditions météo (« en cas de… ») et fermetures saisonnières non
      // datées : pas évaluables, on ne les affiche pas comme fermeture
      if (/en cas d|periode hivernale|periode estivale/.test(n)) continue;
      const m = sentence.match(clauseRe);
      if (!m) continue;
      const label = basinLabel(m[1]);
      if (!label || found.some((f) => f.label === label)) continue;
      found.push({ label, note: `${m[1].trim()} ${m[2].trim()}`.slice(0, 200) });
    }
  }
  return found;
}

/**
 * Cherche le nom du bassin annoncé comme ouvert dans le chapeau / les encarts
 * (ex. Toulouse Lautrec : « Le nouveau bassin sportif nordique, dit "Gisèle
 * Vallerey" … a ouvert aux nageurs le 18 mai ») pour étiqueter les horaires
 * principaux quand la page ne nomme pas le bassin dans la grille.
 */
export function detectOpenBasinLabel(texts: string[]): string | null {
  const re =
    /((?:le |la |les |l')?[^;.]{0,100}?bassins?[^;.]{0,100}?)\s+(?:a r?ouvert|est r?ouvert)/i;
  for (const text of texts) {
    for (const sentence of sentences(text)) {
      if (/en cas d|periode hivernale|periode estivale/.test(norm(sentence))) continue;
      const m = sentence.match(re);
      if (!m) continue;
      const label = basinLabel(
        m[1].replace(/,?\s*dite?\s+/i, " ").replace(/\bnouveau\s+/i, "")
      );
      if (label) return label;
    }
  }
  return null;
}

/**
 * La page décrit-elle un petit bassin extérieur ouvert l'été uniquement (ex.
 * Bellevue : « Petit bassin ouvert uniquement l'été… ») ? La mairie ne lui donne
 * pas d'horaires propres dans la grille : on l'ouvrira alors sur les créneaux du
 * bassin nordique extérieur, mais seulement en période estivale. On écarte les
 * notes de fermeture hivernale (« … fermé pour la période hivernale »).
 */
function hasSummerOnlyExtraBasin(page: PageSections): boolean {
  const texts = [
    page.intro,
    ...page.notices,
    ...page.sections.flatMap((s) => s.lines.map((l) => l.text)),
  ];
  // La description figure souvent dans un long paragraphe (qui mentionne aussi
  // « en saison hivernale ») : on cible donc la tournure exacte « petit bassin …
  // ouvert/uniquement … été ». La note hivernale (« petit bassin … fermé pour la
  // période hivernale ») ne matche pas — ni « ouvert » ni « uniquement » n'y
  // précèdent « été ».
  const re = /petit bassin[^.]{0,40}\b(?:ouvert|uniquement)\b[^.]{0,25}\bete\b/;
  return texts.some((t) => re.test(norm(t)));
}

/** Retire des créneaux les plages fermées (ex. petit bassin fermé de 17h à 19h) */
export function subtractSlots(slots: TimeSlot[], closed: TimeSlot[]): TimeSlot[] {
  let out = slots.map((s) => ({ ...s }));
  for (const c of closed) {
    const next: TimeSlot[] = [];
    for (const s of out) {
      if (c.end <= s.start || c.start >= s.end) {
        next.push(s);
        continue;
      }
      if (c.start > s.start) next.push({ start: s.start, end: c.start });
      if (c.end < s.end) next.push({ start: c.end, end: s.end });
    }
    out = next;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Actualités « En bref » : extensions d'horaires et annonces ponctuelles
// ---------------------------------------------------------------------------

interface PoolNews {
  /** Titre de l'actu — affiché en bandeau et poussé en notification */
  title: string;
  /** Corps de l'actu (mesures, tarifs, dates d'application…) ou null si vide */
  detail: string | null;
  /** Heure de fermeture « HH:MM » si l'actu prolonge l'ouverture, sinon null */
  extendClose: string | null;
  /** Raison de fermeture si l'actu ferme la piscine TOUTE la journée aujourd'hui */
  closure: string | null;
  /**
   * Plage(s) de fermeture PARTIELLE annoncée(s) (« fermée de 12h à 14h ») : on
   * les retire des créneaux du jour au lieu de fermer toute la journée. Null si
   * la fermeture est totale (ou l'actu n'est pas une fermeture).
   */
  closureWindow: TimeSlot[] | null;
  /**
   * Mot-clé du bassin visé quand la fermeture ne concerne QU'UN bassin précis
   * (« fermeture du bassin nordique » → "nordique"). On l'applique alors bassin
   * par bassin (cf. analyzeDay), sans fermer toute la piscine. Null = la
   * fermeture vise toute la piscine.
   */
  closureScope: string | null;
}

/** Corps d'actu affichable : non vide, distinct du titre, borné en longueur. */
function newsDetail(news: ShortNews): string | null {
  const text = news.text.trim();
  if (!text || norm(text) === norm(news.title)) return null;
  return text.length > 600 ? `${text.slice(0, 599).trimEnd()}…` : text;
}

/**
 * Heure de fermeture annoncée dans le texte qui suit le lien de la piscine
 * (« : ouverture jusqu'à 20h » → "20:00"). Exige un indice d'ouverture
 * (« jusqu'à », « ouvert ») pour ne pas confondre avec une autre heure citée.
 */
function parseExtensionClose(after: string): string | null {
  const t = norm(after);
  if (!/jusqu|ouvert/.test(t)) return null;
  const m = t.match(/(\d{1,2})\s*h\s*([0-5]\d)?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 24) return null;
  return fmt(h, min);
}

/** Règle conditionnelle « canicule » d'une grille, sous ses trois formes. */
interface CaniculeRule {
  /**
   * Jours concernés, repris de la règle qui précède — renseigné pour la seule
   * forme « plage » (cf. collectCaniculeRules). null = toute la grille.
   */
  days: Set<number> | null;
  /** Plage complète REMPLAÇANT l'horaire du jour (« de 12h à 21h »). */
  replacement: TimeSlot[] | null;
  /** Fermeture absolue (« fermeture à 21h »). */
  close: string | null;
  /** Décalage de la fermeture, en minutes (« fermeture retardée d'1h »). */
  shiftMinutes: number | null;
  /** Ligne d'origine, affichée en détail du bandeau. */
  source: string;
}

/** « 20:00 » + 60 → « 21:00 », borné à minuit. */
function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 24 * 60);
  return fmt(Math.floor(total / 60), total % 60);
}

/**
 * Lit une règle conditionnelle « canicule ». Trois formes, dans cet ordre :
 * plage complète (« de 12h à 21h ») qui remplace l'horaire du jour, décalage
 * relatif (« fermeture retardée d'1h »), fermeture absolue (« à 21h »).
 * Renvoie null si la ligne ne parle pas de canicule ou n'annonce rien de chiffré.
 */
function parseCaniculeRule(line: string): Omit<CaniculeRule, "days"> | null {
  const t = norm(line);
  if (!/canicule|forte chaleur|vague de chaleur/.test(t)) return null;
  const base = { replacement: null, close: null, shiftMinutes: null, source: line };

  const ranges = parseTimeRanges(line);
  if (ranges.length > 0) return { ...base, replacement: mergeSlots(ranges) };

  const rel = t.match(/(?:retardee|prolongee|decalee|repoussee)\s+d'?\s*(\d{1,2})\s*h/);
  if (rel) return { ...base, shiftMinutes: Number(rel[1]) * 60 };

  const abs = t.match(/(?:\ba|jusqu'?a)\s+(\d{1,2})\s*h\s*([0-5]\d)?/);
  if (abs && Number(abs[1]) <= 24) return { ...base, close: fmt(Number(abs[1]), Number(abs[2] ?? 0)) };

  return null;
}

/**
 * Règles canicule du bloc actif. Une plage de remplacement est rattachée aux
 * jours de la règle qui la précède — la mairie écrit « Samedi et dimanche, de
 * 8h30 à 15h » puis, en dessous, la variante canicule. Les modificateurs
 * (fermeture absolue ou décalée) valent en revanche pour toute la grille : une
 * page ne porte qu'une seule ligne « retardée d'1h », placée après la dernière
 * règle mais applicable à toutes.
 */
function collectCaniculeRules(rules: string[]): CaniculeRule[] {
  const out: CaniculeRule[] = [];
  let lastDays: Set<number> | null = null;
  for (const rule of rules) {
    if (CONDITIONAL_RE.test(norm(rule))) {
      const parsed = parseCaniculeRule(rule);
      if (parsed) out.push({ ...parsed, days: parsed.replacement ? lastDays : null });
      continue;
    }
    if (parseTimeRanges(rule).length > 0) lastDays = parseDays(rule);
  }
  return out;
}

/**
 * Jours d'application d'une fermeture annoncée. « jusqu'au 14 juin » / « du X
 * au Y » → plage explicite ; des dates énumérées (« mardi 28 et mercredi 29
 * juillet ») → ces seuls jours, SAUF si une date seule décrit une fermeture
 * durable (« pour la saison estivale », « fermera ») → début daté, fin ouverte
 * (l'actu se retire quand la mairie la supprime de la page).
 */
function closureDates(text: string, refYear: number): DateScope | null {
  const scope = datedScope(text, refYear);
  if (!scope || !Array.isArray(scope)) return scope;
  if (
    scope.length === 1 &&
    /saison|estival|hivernal|fermera|ferme ses portes|jusqu'a nouvel ordre|definitiv/.test(norm(text))
  )
    return { from: scope[0], to: 99999999 };
  return scope;
}

/**
 * Bassin visé par une fermeture, quand l'actu ne ferme qu'un bassin précis.
 * Renvoie un mot-clé normalisé qui se retrouve dans le libellé du bassin de la
 * grille (ex. « bassin nordique » → "nordique", qui matche « Bassins nordiques
 * extérieurs »). Null si aucun bassin précis n'est nommé → fermeture de toute
 * la piscine. `hay` est déjà normalisé (norm()).
 */
const BASIN_SCOPE_TOKENS = ["nordique", "sportif", "petit bassin", "grand bassin"];
function basinClosureScope(hay: string): string | null {
  for (const tok of BASIN_SCOPE_TOKENS) {
    if (hay.includes(tok)) return tok;
  }
  // Synonymes intérieur / extérieur (les libellés de grille portent l'un ou
  // l'autre : « … intérieurs », « … extérieurs »).
  if (/\bexterieurs?\b|plein air/.test(hay)) return "exterieur";
  if (/\binterieurs?\b|couvert/.test(hay)) return "interieur";
  return null;
}

/**
 * Tournure désignant l'ensemble des piscines. Sert à reconnaître une fermeture
 * collective — le 1er mai, la mairie ferme tout et n'énumère pas les douze
 * piscines, alors que les autres jours fériés font l'objet d'une actu nominative.
 */
const ALL_POOLS_RE =
  /\b(?:toutes les piscines|l'ensemble des piscines|les piscines (?:municipales|toulousaines))\b/;

/**
 * Texte de l'actu SANS les lignes des autres piscines citées. Dans une
 * actu-liste (canicule), chaque ligne ne vaut que pour la piscine qu'elle
 * nomme : la « fermeture technique » d'Alex Jany ou la plage « de 12h à 21h »
 * d'Yvonne Godard ne doivent pas être lues comme valant pour les autres.
 */
function withoutOtherPoolLines(
  news: ShortNews,
  linked: { slug: string; after: string; line?: string }
): string {
  const others = news.pools
    .filter((p) => p.slug !== linked.slug)
    .map((p) => norm(p.line ?? p.after).trim())
    // Un extrait trop court supprimerait des lignes par simple coïncidence.
    .filter((s) => s.length >= 8);
  if (others.length === 0) return news.text;
  return news.text
    .split("\n")
    .filter((l) => !others.some((o) => norm(l).includes(o)))
    .join("\n");
}

/** Clause(s) d'une ligne contenant le motif — découpage aux parenthèses, tirets et point-virgules. */
function clauseWith(re: RegExp, line: string): string | null {
  const clauses = line.split(/[();]|\s[-–—]\s/).filter((c) => re.test(norm(c)));
  return clauses.length > 0 ? clauses.join(" ; ") : null;
}

// ---------------------------------------------------------------------------
// Lecture LLM des actus « En bref » — types et application. L'appel au modèle
// vit dans lib/news-llm.ts (serveur) ; ici on ne fait que consommer sa lecture,
// qui PRIME sur les heuristiques regex de collectPoolNews quand elle existe.
// ---------------------------------------------------------------------------

/** Mesure extraite d'une actu par le LLM. Dates « AAAA-MM-JJ », heures « HH:MM ». */
export interface NewsMeasure {
  kind: "extension" | "closure" | "partial_closure";
  /** extension : fermeture repoussée à cette heure */
  close?: string | null;
  /** partial_closure : plages fermées, retirées des créneaux du jour */
  windows?: { start: string; end: string }[] | null;
  /** closure : bassin précis visé (« nordique »…), null = toute la piscine */
  basin?: string | null;
  /** Jours exacts d'application — prioritaire sur from/to */
  dates?: string[] | null;
  from?: string | null;
  /** null = sans fin annoncée (l'actu se retire quand la mairie la supprime) */
  to?: string | null;
  /** Jours de semaine visés (0 = lundi … 6 = dimanche), null = tous */
  weekdays?: number[] | null;
}

/** Lecture d'une actu entière : quelles piscines, quelles mesures. */
export interface NewsReading {
  pools: { slug: string; measures: NewsMeasure[] }[];
  /** Mesures valant pour toutes les piscines (actu collective sans liste) */
  allPools: NewsMeasure[];
}

/** Lectures LLM par actu, indexées par `«titre»\n«texte»` (cf. newsKey). */
export type NewsReadings = Map<string, NewsReading>;

/** « 2026-07-29 » → 20260729, null si autre forme. */
function isoKey(s: string | null | undefined): number | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Number(s.replace(/-/g, ""));
}

function measureDates(m: NewsMeasure): number[] {
  return (m.dates ?? []).map(isoKey).filter((d): d is number => d !== null);
}

/** La mesure s'applique-t-elle ce jour-là ? */
function measureCovers(m: NewsMeasure, today: TodayInfo): boolean {
  if (m.weekdays && m.weekdays.length > 0 && !m.weekdays.includes(today.weekday)) return false;
  const dates = measureDates(m);
  if (dates.length > 0) return dates.includes(today.dateKey);
  const from = isoKey(m.from) ?? 0;
  const to = isoKey(m.to) ?? 99999999;
  return today.dateKey >= from && today.dateKey <= to;
}

/** Vrai si la mesure est entièrement passée (dernier jour couvert révolu). */
function measurePast(m: NewsMeasure, today: TodayInfo): boolean {
  const dates = measureDates(m);
  if (dates.length > 0) return Math.max(...dates) < today.dateKey;
  const to = isoKey(m.to);
  return to !== null && to < today.dateKey;
}

/**
 * PoolNews du jour d'après la lecture LLM. null = l'actu ne concerne pas cette
 * piscine, ou toutes ses mesures sont passées (la mairie laisse l'actu en ligne
 * après coup — même règle que le chemin regex). Des mesures vides = actu
 * informative : bandeau + notification, sans effet sur les créneaux.
 */
function poolNewsFromReading(
  news: ShortNews,
  reading: NewsReading,
  slug: string,
  today: TodayInfo
): PoolNews | null {
  const measures =
    reading.pools.find((p) => p.slug === slug)?.measures ??
    (reading.allPools.length > 0 ? reading.allPools : null);
  if (!measures) return null;
  if (measures.length > 0 && measures.every((m) => measurePast(m, today))) return null;

  let extendClose: string | null = null;
  let closure: string | null = null;
  let closureScope: string | null = null;
  let windows: TimeSlot[] = [];
  for (const m of measures) {
    if (!measureCovers(m, today)) continue;
    if (m.kind === "extension" && m.close) {
      if (!extendClose || m.close > extendClose) extendClose = m.close;
    } else if (m.kind === "closure") {
      closure = news.title;
      closureScope = m.basin ?? null;
    } else if (m.kind === "partial_closure" && m.windows) {
      windows = windows.concat(m.windows.filter((w) => w.start < w.end));
    }
  }
  return {
    title: news.title,
    detail: newsDetail(news),
    // Fermée toute la journée → l'extension du même jour n'a plus de sens
    extendClose: closure && !closureScope ? null : extendClose,
    closure,
    closureWindow: windows.length > 0 ? mergeSlots(windows) : null,
    closureScope,
  };
}

/**
 * Actualités « En bref » concernant cette piscine et applicables aujourd'hui.
 * Le bloc est identique sur toutes les pages : on ne retient une actu que si
 * elle cite la piscine, soit par un lien /annuaire/<slug> (extensions
 * d'horaires), soit par son nom dans le titre/texte (fermetures saisonnières
 * annoncées sans lien, ex. « Fermeture de la piscine Léo Lagrange… ») — soit,
 * pour les seules fermetures, si elle vise explicitement toutes les piscines.
 */
function collectPoolNews(
  shorts: ShortNews[],
  today: TodayInfo,
  pool: { slug: string; name?: string } | undefined,
  llmNews?: NewsReadings
): PoolNews[] {
  if (!pool) return [];
  // La mairie ne reprend pas les qualificatifs du nom dans ses actus : ni le
  // suffixe saisonnier (« Alfred Nakache » pour la piscine « hiver »), ni le site
  // entre parenthèses (« Jean Boiteux » pour « Jean Boiteux (Espace Job) »).
  const fullName = pool.name ? norm(pool.name).replace(/\s*\([^)]*\)\s*$/, "") : "";
  const season = /\shiver$/.test(fullName) ? "hiver" : /\sete$/.test(fullName) ? "ete" : null;
  const name = fullName.replace(/\s(ete|hiver)$/, "");
  const out: PoolNews[] = [];
  for (const news of shorts) {
    if (!news.title) continue;
    // Lecture LLM disponible : elle fait foi — piscines concernées et mesures
    // comprises — à la place des heuristiques regex ci-dessous.
    const reading = llmNews?.get(`${news.title}\n${news.text}`);
    if (reading) {
      if (out.some((n) => n.title === news.title)) continue;
      const read = poolNewsFromReading(news, reading, pool.slug, today);
      if (read) out.push(read);
      continue;
    }
    const hay = norm(`${news.title} ${news.text}`);
    const linked = news.pools.find((p) => p.slug === pool.slug);
    const named = name.length > 0 && hay.includes(name);
    // Actu collective : reconnue à sa seule tournure, donc réservée aux actus
    // qui ne ciblent AUCUNE piscine en particulier — dès qu'une liste est
    // publiée (canicule, jour férié nominatif), c'est elle qui fait foi.
    const collective = news.pools.length === 0 && ALL_POOLS_RE.test(hay);
    if (!linked && !named && !collective) continue;
    if (out.some((n) => n.title === news.title)) continue;

    // Actu-liste : on n'interprète que le texte concernant CETTE piscine.
    const scopedText = linked ? withoutOtherPoolLines(news, linked) : news.text;
    const hayScoped = norm(`${news.title} ${scopedText}`);

    // Fermeture passée mais actu-liste : la même ligne peut aussi porter une
    // extension toujours en cours (« (fermeture technique mercredi 29
    // juillet) : ouverture jusqu'à 21h ») → on retombe sur l'extension.
    let closurePast = false;
    if (/\bferm/.test(hayScoped)) {
      // Une fermeture saisonnière ne vise pas la piscine qui FONCTIONNE pendant
      // cette saison : « pour la saison estivale » ferme la piscine d'hiver
      // (fermée l'été), pas celle d'été — et inversement.
      if (
        (season === "ete" && /estival/.test(hayScoped)) ||
        (season === "hiver" && /hivernal/.test(hayScoped))
      )
        continue;
      // Fermeture : ne FERME que les jours couverts. Déjà passée → écartée (la
      // mairie laisse l'actu en ligne après coup) ; encore à venir → gardée en
      // bandeau sans fermer le jour, et la notification part dès l'annonce.
      // Ses dates sont d'abord cherchées dans la clause « ferm… » de la ligne
      // de la piscine — le « à compter du » général vaut pour les autres mesures.
      const fermClause = linked ? clauseWith(/ferm/, linked.line ?? linked.after) : null;
      const scope =
        (fermClause ? closureDates(fermClause, today.year) : null) ??
        closureDates(scopedText, today.year) ??
        closureDates(news.title, today.year);
      closurePast = scope !== null && today.dateKey > scopeEnd(scope);
      if (closurePast && (!linked || !parseExtensionClose(linked.after))) continue;
      if (!closurePast) {
        const applies = coversDay(scope, today.dateKey);
        // Fermeture partielle (« fermée … de 12h à 14h ») : on retire ce créneau
        // plutôt que de fermer toute la journée. On n'y voit une fermeture
        // partielle que si une plage horaire est citée ET que le texte ne décrit
        // pas une fermeture de toute la journée/semaine.
        const fullDay =
          /toute la journee|toute la semaine|journee complete|jusqu'a nouvel ordre/.test(hayScoped);
        const windows = fullDay ? [] : mergeSlots(parseTimeRanges(`${news.title}\n${scopedText}`));
        out.push({
          title: news.title,
          detail: newsDetail(news),
          extendClose: null,
          closure: applies && windows.length === 0 ? news.title : null,
          closureWindow: applies && windows.length > 0 ? windows : null,
          closureScope: windows.length > 0 ? null : basinClosureScope(hayScoped),
        });
        continue;
      }
    }

    // Ouverture retardée / indisponibilité annoncée SANS le mot « fermeture »
    // (« ouvrira à partir de 12h », « ne sera pas accessible de 10h à 12h ») :
    // même effet qu'une fermeture partielle. L'annonce reste affichée tous les
    // jours (elle porte sa date) ; les créneaux ne sont retirés que le(s)
    // jour(s) couvert(s) — sinon la grille contredit la notification envoyée.
    const lateOpen = hayScoped.match(
      /(?:ouvrira|ouverture)[^.]{0,80}?a partir de\s+(\d{1,2})\s*h\s*([0-5]\d)?/
    );
    if (
      !closurePast &&
      (lateOpen || /pas accessible|inaccessible|ouverture (?:retardee|decalee)/.test(hayScoped))
    ) {
      const windows = parseTimeRanges(`${news.title}\n${scopedText}`);
      if (lateOpen && Number(lateOpen[1]) <= 24) {
        windows.push({ start: "00:00", end: fmt(Number(lateOpen[1]), Number(lateOpen[2] ?? 0)) });
      }
      const scope = closureDates(scopedText, today.year) ?? closureDates(news.title, today.year);
      const applies = coversDay(scope, today.dateKey);
      out.push({
        title: news.title,
        detail: newsDetail(news),
        extendClose: null,
        closure: null,
        closureWindow: applies && windows.length > 0 ? mergeSlots(windows) : null,
        closureScope: null,
      });
      continue;
    }

    // Actu non bloquante (extension d'horaire, info) : bornée par une plage
    // explicite si présente (« à compter du vendredi 19 juin »…). Une actu
    // seulement collective s'arrête ici : un recrutement ou une info générale
    // n'a pas à s'afficher en bandeau sur les douze piscines.
    if (!linked && !named) continue;
    const range = parseDateRange(scopedText, today.year);
    if (range && (today.dateKey < range.from || today.dateKey > range.to)) continue;
    out.push({
      title: news.title,
      detail: newsDetail(news),
      extendClose: linked ? parseExtensionClose(linked.after) : null,
      closure: null,
      closureWindow: null,
      closureScope: null,
    });
  }
  return out;
}

/**
 * Vrai si le bloc « En bref » signale un épisode de canicule en cours
 * aujourd'hui. La mairie y publie « Canicule : mesures exceptionnelles… »
 * pendant l'alerte et retire l'actu à la levée — sa présence (et sa plage
 * d'application) fait foi. Sert de garde-fou : une règle conditionnelle « en
 * cas d'alerte orange canicule » d'une page n'est honorée que pendant un
 * épisode réellement déclaré (cf. memory/enbref-announcements).
 */
function caniculeEpisodeActive(shorts: ShortNews[], today: TodayInfo): boolean {
  for (const news of shorts) {
    const hay = norm(`${news.title} ${news.text}`);
    if (!/canicule|forte chaleur|vague de chaleur/.test(hay)) continue;
    const range = parseDateRange(news.text, today.year) ?? parseDateRange(news.title, today.year);
    if (range && (today.dateKey < range.from || today.dateKey > range.to)) continue;
    return true;
  }
  return false;
}

/** Repousse la fin du dernier créneau jusqu'à `close` (jamais avant). */
function extendClosing(slots: TimeSlot[], close: string): TimeSlot[] {
  if (slots.length === 0) return slots;
  let idx = 0;
  for (let i = 1; i < slots.length; i++) if (slots[i].end > slots[idx].end) idx = i;
  if (close <= slots[idx].end) return slots;
  return slots.map((s, i) => (i === idx ? { ...s, end: close } : s));
}

// ---------------------------------------------------------------------------
// Analyse principale
// ---------------------------------------------------------------------------

/** Lignes d'info pratique qui ne sont pas des règles d'horaires */
const NOISE_RE = /caisse|evacuation|bassin et les plages|jours? feries?/;

export function analyzeDay(
  page: PageSections,
  today: TodayInfo,
  pool?: { slug: string; name?: string },
  llmNews?: NewsReadings
): DayStatus {
  const allTexts = [page.intro, ...page.notices];
  const alerts = extractAlerts([...allTexts, ...page.sections.map((s) => s.body)]);

  // Actualités « En bref » concernant cette piscine ce jour-là (affichées même
  // si la piscine est fermée). `extendTo` = la fermeture la plus tardive qu'une
  // actu prolonge ; `enBrefClosure` = une fermeture annoncée applicable ce jour.
  const news = collectPoolNews(page.shorts ?? [], today, pool, llmNews);
  const messages: Announcement[] = news.map((n) => ({ title: n.title, detail: n.detail }));
  const extendTo = news.reduce<string | null>(
    (max, n) => (n.extendClose && (!max || n.extendClose > max) ? n.extendClose : max),
    null
  );
  // Fermeture « En bref » de TOUTE la piscine (aucun bassin précis nommé) :
  // elle prime sur les horaires publiés. Une fermeture ciblant un bassin donné
  // (« bassin nordique ») est, elle, appliquée bassin par bassin plus bas, pour
  // ne pas fermer à tort les autres bassins.
  const wholeClosure = news.find((n) => n.closure && !n.closureScope)?.closure ?? null;
  const scopedClosures = news.filter((n) => n.closure && n.closureScope);
  // Fermetures partielles (« fermée de 12h à 14h ») : plages à retirer des
  // créneaux du jour, et titre à afficher si elles vident la journée entière.
  const closeWindows = news.flatMap((n) => n.closureWindow ?? []);
  const partialClosureTitle = news.find((n) => n.closureWindow)?.title ?? null;

  // 1. Fermeture exceptionnelle annoncée hors horaires → prioritaire
  const strongClosure = findStrongClosure(allTexts, today);
  if (strongClosure) {
    return {
      openToday: false,
      slotsToday: [],
      closureReason: strongClosure,
      // la raison est déjà affichée — pas en double dans les alertes
      alerts: alerts.filter((a) => a !== strongClosure),
      confidence: "high",
      basins: [],
      announcements: messages,
    };
  }

  // 1 bis. Fermeture annoncée « En bref » de TOUTE la piscine (saisonnière, sans
  // lien dans la grille) → fermée, prime sur les horaires publiés. (Les
  // fermetures ciblant un bassin précis sont traitées après la grille.)
  if (wholeClosure) {
    return {
      openToday: false,
      slotsToday: [],
      closureReason: wholeClosure,
      alerts,
      confidence: "high",
      basins: [],
      announcements: messages,
    };
  }

  // 2. Choisir le bloc de période applicable aujourd'hui
  const blocks = buildBlocks(page.sections, today.year);
  if (blocks.length === 0) {
    return {
      openToday: false,
      slotsToday: [],
      closureReason: "Aucun horaire publié actuellement sur la page de la mairie",
      alerts,
      confidence: "low",
      basins: [],
      announcements: messages,
    };
  }

  let confidence: DayStatus["confidence"] = "high";

  const dated = blocks
    .filter((b) => b.range && today.dateKey >= b.range.from && today.dateKey <= b.range.to)
    .sort((a, b) => spanOf(a.range) - spanOf(b.range));

  let selected: PeriodBlock | null = dated[0] ?? null;

  // En juillet / août, une grille « vacances hors été » ne décrit pas la période
  // en cours : on l'écarte du repli plutôt que d'afficher ses horaires.
  const summerNow = isSummerMonth(today);
  const summerExcluded = summerNow && blocks.some((b) => !b.range && b.excludesSummer);

  if (!selected) {
    // Aucune plage datée ne couvre aujourd'hui → arbitrage scolaire / vacances
    const undated = blocks.filter((b) => !b.range && !(summerNow && b.excludesSummer));
    const school = undated.find((b) => b.periodType === "school");
    const vacation = undated.find((b) => b.periodType === "vacation");
    if (today.isSchoolHoliday === true && vacation) {
      selected = vacation;
    } else if (today.isSchoolHoliday === false && school) {
      selected = school;
    } else {
      selected = school ?? undated.find((b) => b.periodType === null) ?? vacation ?? null;
      if (undated.length > 1 || today.isSchoolHoliday === null) confidence = "low";
      // Bloc choisi faute de mieux alors qu'il contredit le calendrier
      // scolaire (ex. horaires « vacances » en période scolaire parce que le
      // bloc scolaire est expiré) : à vérifier sur la page officielle.
      if (
        (today.isSchoolHoliday === false && selected?.periodType === "vacation") ||
        (today.isSchoolHoliday === true && selected?.periodType === "school")
      ) {
        confidence = "low";
      }
    }
  }

  if (!selected) {
    // Tous les blocs sont datés mais aucun ne couvre aujourd'hui : typique des
    // piscines saisonnières (« été ») hors saison — fermeture sûre. Si en
    // revanche il ne restait que des grilles « hors été » écartées ci-dessus, la
    // page ne dit simplement rien de la période : fermeture à confirmer.
    return {
      openToday: false,
      slotsToday: [],
      closureReason: "Pas d'ouverture prévue à cette période",
      alerts,
      confidence: summerExcluded ? "low" : "high",
      basins: [],
      announcements: messages,
    };
  }

  // 3. Appliquer les règles du bloc au jour de la semaine, bassin par bassin
  interface BasinAcc {
    label: string | null;
    slots: TimeSlot[];
    closedNote: string | null;
    closedWeekday: boolean;
  }
  const basinOrder: (string | null)[] = [];
  const basinMap = new Map<string | null, BasinAcc>();
  const ensureBasin = (label: string | null): BasinAcc => {
    let acc = basinMap.get(label);
    if (!acc) {
      acc = { label, slots: [], closedNote: null, closedWeekday: false };
      basinMap.set(label, acc);
      basinOrder.push(label);
    }
    return acc;
  };
  const derived: { fromLabel: string | null; label: string; closed: TimeSlot[]; note: string }[] =
    [];
  /**
   * Ajoute un bassin dérivé sans doublon : un même bassin cité par plusieurs
   * règles (ex. parenthèses du jeudi ET du vendredi) ne donne qu'une ligne,
   * et les restrictions du jour priment sur les mentions des autres jours.
   */
  const addDerived = (
    fromLabel: string | null,
    label: string,
    closed: TimeSlot[],
    note: string
  ) => {
    const existing = derived.find((d) => d.fromLabel === fromLabel && d.label === label);
    if (!existing) {
      derived.push({ fromLabel, label, closed, note });
      return;
    }
    if (closed.length > 0) {
      if (existing.closed.length === 0) existing.note = note;
      existing.closed.push(...closed);
    }
  };

  let currentLabel: string | null = null;
  let sawAnyRule = false;

  for (const rawRule of selected.rules) {
    // Notes de bas de page (« *Le petit bassin nordique… ») : signalées
    // seulement si elles décrivent un événement exceptionnel
    if (rawRule.trim().startsWith("*")) {
      const s = rawRule.trim().replace(/^\*\s*/, "");
      const n = norm(s);
      if (
        ALERT_KEYWORDS.some((k) => n.includes(k)) &&
        !CONDITIONAL_RE.test(n) &&
        !alerts.includes(s)
      ) {
        alerts.push(s);
      }
      continue;
    }
    for (const piece of splitMultiDay(rawRule)) {
      const { cleaned, notes } = stripClosedRanges(piece);
      const n = norm(cleaned);
      if (NOISE_RE.test(n)) continue;
      // Règle conditionnelle (« En cas d'alerte orange canicule, de 12h à 21h ») :
      // ce n'est pas l'horaire du jour. Seul le repli canicule la traduit en
      // fermeture repoussée, et uniquement pendant un épisode déclaré.
      if (CONDITIONAL_RE.test(n)) continue;

      const days = parseDays(cleaned);
      const times = parseTimeRanges(cleaned);
      const mentionsBasin = BASIN_RE.test(n);
      const mentionsFerme = /fermee?s?\b|fermeture/.test(n);

      if (times.length === 0) {
        if (mentionsBasin && days === null) {
          // Étiquette de bassin (« Bassins nordiques extérieurs ») ou
          // fermeture d'un bassin (« Les bassins intérieurs sont fermés »)
          const label = basinLabel(cleaned) || null;
          currentLabel = label;
          const acc = ensureBasin(label);
          if (mentionsFerme) {
            const range = parseDateRange(cleaned, today.year);
            if (!range || (today.dateKey >= range.from && today.dateKey <= range.to)) {
              acc.closedNote = cleaned;
            }
            sawAnyRule = true;
          }
          continue;
        }
        if (mentionsFerme) {
          const range = parseDateRange(cleaned, today.year);
          if (range) {
            // « Fermeture à compter du 6 juin jusqu'au 30 août 2026 » —
            // s'applique au bassin courant
            sawAnyRule = true;
            if (today.dateKey >= range.from && today.dateKey <= range.to) {
              ensureBasin(currentLabel).closedNote = cleaned;
            }
            continue;
          }
          if (days) {
            // « Mardi : fermé »
            sawAnyRule = true;
            if (days.has(today.weekday)) ensureBasin(currentLabel).closedWeekday = true;
            continue;
          }
        }
        continue;
      }

      // Fermeture partielle d'un bassin avec heures (« Le petit bassin est
      // fermé le lundi, mardi et mercredi de 18h à 21h ») : ce sont des heures
      // de FERMETURE, pas d'ouverture — bassin dérivé aux créneaux réduits.
      // currentLabel reste inchangé : les lignes suivantes (« Jeudi : … »)
      // appartiennent toujours au bassin principal.
      if (mentionsFerme && mentionsBasin) {
        sawAnyRule = true;
        // Le bassin apparaît tous les jours : créneaux réduits quand la
        // fermeture s'applique, horaires complets de la piscine sinon —
        // ainsi la ligne ne disparaît pas d'un jour à l'autre.
        const appliesToday = days === null || days.has(today.weekday);
        addDerived(currentLabel, basinLabel(cleaned), appliesToday ? times : [], piece.trim());
        continue;
      }

      // Règle avec heures — éventuellement étiquetée inline
      // (« Bassin nordique uniquement de 10h à 20h »)
      const label = mentionsBasin ? basinLabel(cleaned) || currentLabel : currentLabel;
      if (mentionsBasin) currentLabel = label;
      sawAnyRule = true;
      const appliesToday = days === null || days.has(today.weekday);
      for (const note of notes) {
        // « (petit bassin fermé de 17h à 19h) » → bassin dérivé avec créneaux
        // réduits (affiché comme ligne de bassin, pas comme alerte). Déclaré
        // même les jours sans restriction, pour que la ligne du bassin
        // n'apparaisse pas et disparaisse au fil de la semaine.
        if (BASIN_RE.test(norm(note))) {
          const closed = parseTimeRanges(note);
          if (closed.length > 0) {
            addDerived(label, basinLabel(note), appliesToday ? closed : [], note);
          }
        }
      }
      if (!appliesToday) continue;
      ensureBasin(label).slots.push(...times);
    }
  }

  if (!sawAnyRule) {
    return {
      openToday: false,
      slotsToday: [],
      closureReason: "Horaires publiés non reconnus",
      alerts,
      confidence: "low",
      basins: [],
      announcements: messages,
    };
  }

  // 4. Consolidation par bassin
  const basins: BasinSchedule[] = [];
  for (const label of basinOrder) {
    const acc = basinMap.get(label)!;
    const closed = acc.closedNote !== null || acc.closedWeekday;
    basins.push({
      label,
      slots: closed ? [] : mergeSlots(acc.slots),
      note: acc.closedNote ?? (acc.closedWeekday ? `Fermé le ${DAY_NAMES[today.weekday]}` : null),
    });
  }
  for (const d of derived) {
    const base = basins.find((b) => b.label === d.fromLabel);
    if (!base || base.slots.length === 0) continue;
    basins.push({ label: d.label, slots: subtractSlots(base.slots, d.closed), note: d.note });
  }

  // Bassins fermés pour travaux annoncés hors horaires (chapeau / encarts)
  for (const c of detectClosedBasins(allTexts)) {
    if (!basins.some((b) => b.label && norm(b.label) === norm(c.label))) {
      basins.push({ label: c.label, slots: [], note: c.note });
    }
  }

  // Si la grille d'horaires ne nomme pas son bassin mais que la page annonce
  // quel bassin est ouvert, on reprend ce nom
  const mainBasin = basins.find((b) => b.label === null);
  if (mainBasin && mainBasin.slots.length > 0) {
    const openLabel = detectOpenBasinLabel(allTexts);
    if (openLabel && !basins.some((b) => b.label && norm(b.label) === norm(openLabel))) {
      mainBasin.label = openLabel;
    }
  }

  // Fermeture « En bref » ciblant un bassin précis (« fermeture du bassin
  // nordique … ») : on ne ferme QUE le(s) bassin(s) correspondant(s), en gardant
  // les autres tels que la grille les décrit (ex. été : intérieurs déjà fermés,
  // nordique fermé par l'actu → deux lignes distinctes). Bassin introuvable dans
  // la grille → par sécurité, fermeture de toute la piscine (mieux vaut
  // sur-fermer qu'ignorer un avis de fermeture).
  let scopedFallbackReason: string | null = null;
  for (const sc of scopedClosures) {
    const scope = sc.closureScope!;
    const matched = basins.filter((b) => b.label && norm(b.label).includes(scope));
    if (matched.length > 0) {
      for (const b of matched) {
        b.slots = [];
        b.note = sc.closure;
      }
    } else {
      for (const b of basins) b.slots = [];
      scopedFallbackReason = sc.closure;
    }
  }

  // Repli « canicule » : quand la mairie a déclaré un épisode dans le bloc « En
  // bref » et que la grille active porte une règle conditionnelle (« En cas
  // d'alerte orange canicule… »), on l'honore — la page ne le signalant pas
  // autrement. On ne lit que les règles du bloc actif aujourd'hui : le repli est
  // donc borné à la période concernée (la règle 21h vit dans la grille estivale,
  // pas la scolaire — inerte hors été).
  const latestClose = () =>
    basins.reduce((m, b) => b.slots.reduce((mm, s) => (s.end > mm ? s.end : mm), m), "");
  const caniculeToday = caniculeEpisodeActive(page.shorts ?? [], today)
    ? collectCaniculeRules(selected.rules).filter((r) => r.days === null || r.days.has(today.weekday))
    : [];

  // Une plage de remplacement SUBSTITUE l'horaire du jour au lieu de le
  // prolonger : le samedi de Godard passe de 8h30-15h à 12h-21h, ouverture
  // décalée comprise. Les bassins déjà fermés le restent.
  const replacement = caniculeToday.find((r) => r.replacement)?.replacement ?? null;
  if (replacement) {
    for (const b of basins) {
      if (b.slots.length > 0) b.slots = mergeSlots(replacement);
    }
  }

  // Fermeture absolue ou décalée. Le décalage se calcule APRÈS un éventuel
  // remplacement, sur l'horaire réellement affiché ce jour-là.
  let caniculeClose: string | null = null;
  let caniculeRule: string | null = null;
  for (const r of caniculeToday) {
    let close = r.close;
    if (r.shiftMinutes !== null) {
      const base = latestClose();
      close = base ? addMinutes(base, r.shiftMinutes) : null;
    }
    if (close && (!caniculeClose || close > caniculeClose)) {
      caniculeClose = close;
      caniculeRule = r.source;
    }
  }

  // Extension d'horaire : repousse la fermeture du jour à la plus tardive entre
  // l'actu « En bref » liée à la piscine (extendTo) et la règle conditionnelle
  // canicule du bloc actif (caniculeClose). N'ouvre jamais un bassin fermé
  // (extendClosing ignore les vides). `extendedTo` n'est renseigné que si
  // l'extension dépasse vraiment l'horaire publié (sinon elle est sans effet,
  // ex. week-end déjà ouvert plus tard).
  const target =
    [extendTo, caniculeClose].filter((t): t is string => t !== null).sort().at(-1) ?? null;
  let extendedTo: string | null = null;
  if (target) {
    const before = latestClose();
    for (const b of basins) b.slots = extendClosing(b.slots, target);
    if (latestClose() > before) extendedTo = target;
  }

  // Horaires canicule de substitution : bandeau dédié, notifiable comme les
  // autres annonces (le bandeau « fermeture prolongée » ci-dessous ne couvre
  // que l'allongement, pas le décalage d'ouverture).
  if (replacement) {
    const plages = replacement.map((s) => `${closeLabel(s.start)}–${closeLabel(s.end)}`).join(", ");
    messages.push({
      title: `Canicule : horaires modifiés (${plages})`,
      detail: caniculeToday.find((r) => r.replacement)?.source ?? null,
    });
  }

  // Si c'est le repli canicule qui a réellement repoussé la fermeture (au-delà
  // de toute actu « En bref » liée), on l'explique par un bandeau dédié,
  // notifiable comme les autres annonces (cf. exceptionalSignature).
  if (caniculeClose && extendedTo === caniculeClose && (extendTo === null || caniculeClose > extendTo)) {
    messages.push({
      title: `Canicule : fermeture prolongée à ${closeLabel(caniculeClose)}`,
      detail: caniculeRule,
    });
  }

  // Fermeture partielle annoncée « En bref » : on retire la plage du jour de
  // chaque bassin. La piscine reste ouverte autour du créneau fermé.
  if (closeWindows.length > 0) {
    for (const b of basins) b.slots = subtractSlots(b.slots, closeWindows);
  }

  // Petit bassin extérieur ouvert l'été uniquement (décrit par la page mais sans
  // horaires propres) : ajouté comme bassin distinct en période estivale, sur
  // les créneaux du bassin extérieur ouvert du jour (le nordique). Hors été il
  // n'apparaît pas ; on ne double pas un « petit bassin » déjà présent.
  if (selected.summer && hasSummerOnlyExtraBasin(page)) {
    const outdoorOpen = basins.find(
      (b) => b.slots.length > 0 && classifyBasinEnv(b.label) === "outdoor"
    );
    const already = basins.some((b) => /petit bassin/.test(norm(b.label ?? "")));
    if (outdoorOpen && !already) {
      basins.push({
        label: "Petit bassin extérieur",
        slots: mergeSlots(outdoorOpen.slots),
        note: null,
      });
    }
  }

  const union = mergeSlots(basins.flatMap((b) => b.slots));

  if (union.length === 0) {
    const reason =
      scopedFallbackReason ??
      partialClosureTitle ??
      basins.find((b) => b.note)?.note ??
      `Pas d'ouverture le ${DAY_NAMES[today.weekday]}`;
    return {
      openToday: false,
      slotsToday: [],
      closureReason: reason,
      alerts,
      confidence,
      basins,
      announcements: messages,
    };
  }

  return {
    openToday: true,
    slotsToday: union,
    closureReason: null,
    alerts,
    confidence,
    basins,
    announcements: messages,
    extendedTo,
  };
}
