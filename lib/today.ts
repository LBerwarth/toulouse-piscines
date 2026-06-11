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

/**
 * Vacances scolaires de l'académie de Toulouse via l'open data du ministère
 * de l'Éducation nationale. Gratuit, sans clé. Mis en cache 24 h.
 */
async function isSchoolHolidayToulouse(now: Date): Promise<boolean | null> {
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
    const t = now.getTime();
    for (const r of data.results) {
      if (!r.start_date || !r.end_date) continue;
      if (t >= Date.parse(r.start_date) && t <= Date.parse(r.end_date)) return true;
    }
    return false;
  } catch {
    return null;
  }
}

export async function getTodayInfo(): Promise<TodayInfo> {
  const now = new Date();
  // Date civile à Toulouse (le serveur peut tourner en UTC)
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
  const [y, m, d] = iso.split("-").map(Number);
  const weekdayName = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
  })
    .format(now)
    .toLowerCase();

  return {
    dateKey: y * 10000 + m * 100 + d,
    year: y,
    weekday: Math.max(0, WEEKDAYS.indexOf(weekdayName)),
    isSchoolHoliday: await isSchoolHolidayToulouse(now),
  };
}
