import type { PageSections, SectionLine } from "./scrape";
import type { TodayInfo } from "./today";

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

  // du 5 juin (2026)? au 5 juillet (2026)?
  let m = t.match(
    new RegExp(
      `du\\s+(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?\\s+au\\s+(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`
    )
  );
  if (m) {
    const y1 = m[3] ? Number(m[3]) : refYear;
    let y2 = m[6] ? Number(m[6]) : y1;
    let from = dateKey(y1, MONTHS.indexOf(m[2]), Number(m[1]));
    let to = dateKey(y2, MONTHS.indexOf(m[5]), Number(m[4]));
    if (to < from && !m[6]) {
      // période à cheval sur deux années (ex. « du 1er septembre au 30 juin »)
      y2 += 1;
      to = dateKey(y2, MONTHS.indexOf(m[5]), Number(m[4]));
    }
    return { from, to };
  }

  // du 24 au 30 août (2026)? — mois partagé
  m = t.match(
    new RegExp(`du\\s+(\\d{1,2})(?:er)?\\s+au\\s+(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`)
  );
  if (m) {
    const y = m[4] ? Number(m[4]) : refYear;
    const monthIdx = MONTHS.indexOf(m[3]);
    return { from: dateKey(y, monthIdx, Number(m[1])), to: dateKey(y, monthIdx, Number(m[2])) };
  }

  // à compter du / à partir du / dès le / depuis le 5 juin (2026)? —
  // éventuellement combiné avec « jusqu'au 30 août (2026)? » dans la même phrase
  const fromM = t.match(
    new RegExp(
      `(?:a compter du|a partir du|des le|depuis le)\\s+(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`
    )
  );
  const toM = t.match(new RegExp(`jusqu'?au\\s+(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`));
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

/** Date isolée (« le samedi 20 juin », « ce 14 juillet ») → plage d'un jour */
export function parseSingleDate(text: string, refYear: number): DateRange | null {
  const t = norm(text);
  const m = t.match(
    new RegExp(
      `\\b(?:le|ce)\\s+(?:(?:${DAY_NAMES.join("|")})\\s+)?(\\d{1,2})(?:er)?\\s+(${MONTH_RE})\\s*(\\d{4})?`
    )
  );
  if (!m) return null;
  const k = dateKey(m[3] ? Number(m[3]) : refYear, MONTHS.indexOf(m[2]), Number(m[1]));
  return { from: k, to: k };
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
}

function periodTypeOf(title: string): PeriodType {
  const t = norm(title);
  if (/vacances|estival|ete\b/.test(t)) return "vacation";
  if (/scolaire/.test(t)) return "school";
  return null;
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

    let current: PeriodBlock = { range: sectionRange, periodType, rules: [] };
    blocks.push(current);

    for (const line of section.lines) {
      // Seuls les sous-titres datés découpent la période ; tout le reste
      // (y compris les étiquettes de bassin en <h4>) reste une règle.
      const candidateHeading =
        (line.kind === "heading" && !/ferm/.test(norm(line.text))) ||
        isDateOnlyLine(line.text, refYear);
      const headingRange = candidateHeading ? parseDateRange(line.text, refYear) : null;
      if (headingRange) {
        current = { range: headingRange, periodType, rules: [] };
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
];

/** Phrases conditionnelles (« en cas de… », « lors des matchs… ») : info permanente, pas une alerte */
const CONDITIONAL_RE = /\b(en cas d|lors d|si la |si le |si vous )/;

const STRONG_CLOSURE_RE =
  /(fermeture exceptionnelle|exceptionnellement fermee?|fermee? (?:pour|en raison|suite a|jusqu)[^.]*|piscine (?:est |restera )?fermee)/;

function extractAlerts(texts: string[]): string[] {
  const alerts: string[] = [];
  for (const text of texts) {
    const sentences = text.split(/(?<=[.!])\s+/);
    for (const sentence of sentences) {
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

function findStrongClosure(texts: string[], today: TodayInfo): string | null {
  for (const text of texts) {
    const sentences = text.split(/(?<=[.!])\s+/);
    for (const sentence of sentences) {
      const n = norm(sentence);
      const m = n.match(STRONG_CLOSURE_RE);
      if (!m) continue;
      // Réouverture déjà annoncée → la fermeture est passée
      if (/rouvert|a rouvert|reouverture effectuee|s'est terminee/.test(n)) continue;
      // Fermeture datée (« jusqu'au 14 juin », « le samedi 20 juin ») :
      // ne s'applique qu'aux jours couverts — important pour la vue semaine.
      const range = parseDateRange(sentence, today.year) ?? parseSingleDate(sentence, today.year);
      if (range && (today.dateKey < range.from || today.dateKey > range.to)) continue;
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
    for (const sentence of text.split(/(?<=[.!])\s+/)) {
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
    for (const sentence of text.split(/(?<=[.!])\s+/)) {
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
// Analyse principale
// ---------------------------------------------------------------------------

/** Lignes d'info pratique qui ne sont pas des règles d'horaires */
const NOISE_RE = /caisse|evacuation|bassin et les plages|jours? feries?/;

export function analyzeDay(page: PageSections, today: TodayInfo): DayStatus {
  const allTexts = [page.intro, ...page.notices];
  const alerts = extractAlerts([...allTexts, ...page.sections.map((s) => s.body)]);

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
    };
  }

  let confidence: DayStatus["confidence"] = "high";

  const dated = blocks
    .filter((b) => b.range && today.dateKey >= b.range.from && today.dateKey <= b.range.to)
    .sort((a, b) => spanOf(a.range) - spanOf(b.range));

  let selected: PeriodBlock | null = dated[0] ?? null;

  if (!selected) {
    // Aucune plage datée ne couvre aujourd'hui → arbitrage scolaire / vacances
    const undated = blocks.filter((b) => !b.range);
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
    // Tous les blocs sont datés mais aucun ne couvre aujourd'hui :
    // typique des piscines saisonnières (« été ») hors saison.
    return {
      openToday: false,
      slotsToday: [],
      closureReason: "Pas d'ouverture prévue à cette période",
      alerts,
      confidence: "high",
      basins: [],
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

  const union = mergeSlots(basins.flatMap((b) => b.slots));

  if (union.length === 0) {
    const reason =
      basins.find((b) => b.note)?.note ?? `Pas d'ouverture le ${DAY_NAMES[today.weekday]}`;
    return {
      openToday: false,
      slotsToday: [],
      closureReason: reason,
      alerts,
      confidence,
      basins,
    };
  }

  return { openToday: true, slotsToday: union, closureReason: null, alerts, confidence, basins };
}
