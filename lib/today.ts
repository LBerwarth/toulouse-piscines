export interface TodayInfo {
  /** Entier comparable AAAAMMJJ, ex. 20260611 */
  dateKey: number;
  /** Année courante (pour compléter les dates sans année) */
  year: number;
  /** 0 = lundi … 6 = dimanche */
  weekday: number;
  /** true/false selon le calendrier officiel zone C (Toulouse) ; null si l'API est indisponible */
  isSchoolHoliday: boolean | null;
}

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

interface HolidayRange {
  start: number;
  end: number;
}

/**
 * Vacances scolaires de l'académie de Toulouse via l'open data du ministère
 * de l'Éducation nationale. Gratuit, sans clé. Mis en cache 24 h.
 */
async function getHolidayRanges(): Promise<HolidayRange[] | null> {
  try {
    const where = encodeURIComponent('location="Toulouse"');
    const url =
      "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records" +
      `?select=start_date,end_date&where=${where}&order_by=start_date%20desc&limit=40`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { start_date?: string; end_date?: string }[];
    };
    if (!data.results) return null;
    const ranges: HolidayRange[] = [];
    for (const r of data.results) {
      if (!r.start_date || !r.end_date) continue;
      ranges.push({ start: Date.parse(r.start_date), end: Date.parse(r.end_date) });
    }
    return ranges;
  } catch {
    return null;
  }
}

function dayInfo(date: Date, ranges: HolidayRange[] | null): TodayInfo {
  // Date civile à Toulouse (le serveur peut tourner en UTC)
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
  const [y, m, d] = iso.split("-").map(Number);
  const weekdayName = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
  })
    .format(date)
    .toLowerCase();
  const t = date.getTime();

  return {
    dateKey: y * 10000 + m * 100 + d,
    year: y,
    weekday: Math.max(0, WEEKDAYS.indexOf(weekdayName)),
    isSchoolHoliday: ranges ? ranges.some((r) => t >= r.start && t <= r.end) : null,
  };
}

/**
 * Les 7 prochains jours à partir d'aujourd'hui ([0] = aujourd'hui), chacun
 * avec son statut vacances scolaires — chaque jour de la semaine apparaît
 * exactement une fois.
 */
export async function getWeekInfo(): Promise<TodayInfo[]> {
  const ranges = await getHolidayRanges();
  const now = new Date();
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
  const [y, m, d] = iso.split("-").map(Number);
  // Midi UTC : un pas de 24 h tombe toujours sur le bon jour civil à Paris,
  // même les nuits de changement d'heure.
  const base = Date.UTC(y, m - 1, d, 12);
  return Array.from({ length: 7 }, (_, i) => dayInfo(new Date(base + i * 86400000), ranges));
}

export async function getTodayInfo(): Promise<TodayInfo> {
  return (await getWeekInfo())[0];
}
