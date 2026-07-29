import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POOLS } from "./pools";
import type { ShortNews } from "./scrape";
import type { NewsMeasure, NewsReading, NewsReadings } from "./parse-schedule";

/**
 * Lecture LLM des actualités « En bref » (Gemini, free tier Google AI Studio).
 *
 * Les actus sont du texte libre reformulé à chaque épisode — les heuristiques
 * regex de parse-schedule courent après chaque nouvelle tournure. Ici, chaque
 * actu est interprétée UNE fois par le modèle (mesures par piscine, en JSON
 * contraint par schéma), puis mise en cache : Supabase (durable, par hash de
 * l'actu) + mémo en mémoire (les 12 pages portent le même bloc).
 *
 * Best-effort de bout en bout : sans GEMINI_API_KEY, sans réseau, sans table ou
 * sur réponse invalide, on rend une Map incomplète et parse-schedule retombe
 * sur ses regex pour les actus manquantes. Jamais bloquant, jamais d'exception.
 */

/** Clé d'une actu dans la Map des lectures — même convention que collectPoolNews. */
export function newsKey(news: Pick<ShortNews, "title" | "text">): string {
  return `${news.title}\n${news.text}`;
}

/**
 * Version du prompt/schéma, baquée dans le hash : toute évolution invalide le
 * cache et force une relecture cohérente (les anciennes lignes restent, inertes).
 */
const PROMPT_VERSION = 3;

function hashKey(key: string): string {
  return createHash("sha256").update(`v${PROMPT_VERSION}\n${key}`).digest("hex");
}

function model(): string {
  // Épinglé : « gemini-flash-latest » suit le tout dernier modèle, dont le
  // quota journalier gratuit est minuscule (3.6-flash : 20 requêtes/jour).
  return process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
}

const HHMM_RE = /^(\d{1,2}):([0-5]\d)$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function normTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(HHMM_RE);
  if (!m || Number(m[1]) > 24) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function normDate(v: unknown): string | null {
  return typeof v === "string" && ISO_RE.test(v) ? v : null;
}

function readMeasure(raw: unknown): NewsMeasure | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== "extension" && kind !== "closure" && kind !== "partial_closure") return null;

  const close = normTime(o.close);
  const open = normTime(o.open);
  const windows = Array.isArray(o.windows)
    ? o.windows
        .map((w) => {
          const start = normTime((w as Record<string, unknown>)?.start);
          const end = normTime((w as Record<string, unknown>)?.end);
          return start && end && start < end ? { start, end } : null;
        })
        .filter((w): w is { start: string; end: string } => w !== null)
    : [];
  // Mesure sans son contenu obligatoire : on la jette plutôt que de deviner
  if (kind === "extension" && !close && !open) return null;
  if (kind === "partial_closure" && windows.length === 0) return null;

  const dates = Array.isArray(o.dates)
    ? o.dates.map(normDate).filter((d): d is string => d !== null)
    : [];
  const weekdays = Array.isArray(o.weekdays)
    ? o.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  return {
    kind,
    close,
    open,
    windows: windows.length > 0 ? windows : null,
    basin: typeof o.basin === "string" && o.basin.trim() ? o.basin.trim() : null,
    dates: dates.length > 0 ? dates : null,
    from: normDate(o.from),
    to: normDate(o.to),
    weekdays: weekdays.length > 0 ? weekdays : null,
  };
}

/** Valide et normalise la réponse JSON du modèle. null = inutilisable. */
export function parseReading(raw: unknown): NewsReading | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const slugs = new Set(POOLS.map((p) => p.slug));
  const pools: NewsReading["pools"] = [];
  for (const entry of Array.isArray(o.pools) ? o.pools : []) {
    const e = entry as Record<string, unknown>;
    const slug = typeof e?.slug === "string" ? e.slug : null;
    if (!slug || !slugs.has(slug) || pools.some((p) => p.slug === slug)) continue;
    const measures = (Array.isArray(e.measures) ? e.measures : [])
      .map(readMeasure)
      .filter((m): m is NewsMeasure => m !== null);
    pools.push({ slug, measures });
  }
  const allPools = (Array.isArray(o.allPools) ? o.allPools : [])
    .map(readMeasure)
    .filter((m): m is NewsMeasure => m !== null);
  return { pools, allPools };
}

// Schéma de réponse Gemini (sous-ensemble OpenAPI) : objet mesure à plat,
// discriminé par `kind` — les unions ne sont pas fiables côté responseSchema.
const MEASURE_SCHEMA = {
  type: "OBJECT",
  properties: {
    kind: { type: "STRING", enum: ["extension", "closure", "partial_closure"] },
    close: { type: "STRING", nullable: true, description: "extension : nouvelle heure de fermeture HH:MM" },
    open: { type: "STRING", nullable: true, description: "extension : heure d'ouverture avancée HH:MM" },
    windows: {
      type: "ARRAY",
      nullable: true,
      description: "partial_closure : plages fermées dans la journée",
      items: {
        type: "OBJECT",
        properties: { start: { type: "STRING" }, end: { type: "STRING" } },
        required: ["start", "end"],
      },
    },
    basin: { type: "STRING", nullable: true, description: "closure : bassin visé si un seul (ex. nordique)" },
    dates: { type: "ARRAY", nullable: true, items: { type: "STRING" }, description: "jours précis AAAA-MM-JJ" },
    from: { type: "STRING", nullable: true, description: "début AAAA-MM-JJ (borne incluse)" },
    to: { type: "STRING", nullable: true, description: "fin AAAA-MM-JJ, null = sans fin annoncée" },
    weekdays: {
      type: "ARRAY",
      nullable: true,
      items: { type: "INTEGER" },
      description: "jours de semaine visés, 0 = lundi … 6 = dimanche",
    },
  },
  required: ["kind"],
} as const;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    pools: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          slug: { type: "STRING", enum: POOLS.map((p) => p.slug) },
          measures: { type: "ARRAY", items: MEASURE_SCHEMA },
        },
        required: ["slug", "measures"],
      },
    },
    allPools: { type: "ARRAY", items: MEASURE_SCHEMA },
  },
  required: ["pools", "allPools"],
} as const;

function buildPrompt(news: ShortNews): string {
  const poolList = POOLS.map((p) => `- ${p.slug} : ${p.name}`).join("\n");
  return `Tu analyses une actualité publiée par la mairie de Toulouse au sujet de ses piscines municipales, afin d'en extraire les changements d'horaires.

Piscines connues (slug : nom) :
${poolList}

Actualité (publiée le ${news.date ?? "date inconnue"}) :
Titre : ${news.title}
Texte :
${news.text}

Consignes :
- Liste dans "pools" chaque piscine de la liste réellement concernée, avec ses mesures propres. Une mesure écrite sur la ligne d'une piscine (y compris entre parenthèses dans son nom) ne vaut que pour elle.
- "allPools" : mesures valant pour toutes les piscines à la fois (ex. « toutes les piscines seront fermées le 1er mai ») — uniquement si l'actu ne liste pas les piscines une à une.
- Types de mesures :
  - "extension" : ouverture prolongée ou avancée → "close" = nouvelle heure de fermeture (HH:MM) et/ou "open" = nouvelle heure d'ouverture si elle est avancée (HH:MM).
  - "closure" : fermée toute la journée → "basin" seulement si un seul bassin est visé (ex. « nordique »).
  - "partial_closure" : fermée une partie de la journée → "windows" = plages FERMÉES (HH:MM).
- Dates : "dates" pour des jours précis énumérés, sinon "from"/"to" (AAAA-MM-JJ, bornes incluses, année déduite de la date de publication). "to" = null si aucune fin n'est annoncée. Piscine annoncée fermée sans aucune date (« actuellement fermée ») : closure avec "from" et "to" null. "weekdays" (0 = lundi … 6 = dimanche) seulement si la mesure ne vaut que certains jours (ex. « le week-end » → [5, 6]).
- Certaines piscines existent en deux variantes saisonnières dans la liste (« été » / « hiver ») : une fermeture « pour la saison estivale » ne vise que la variante « hiver » (c'est elle qui ferme l'été), une fermeture hivernale ne vise que la variante « été ». Ne liste jamais la variante qui fonctionne pendant la saison.
- Toute piscine explicitement nommée par l'actu doit figurer dans "pools" — avec "measures": [] si l'actu ne modifie pas ses horaires (animation, événement, info pratique).
- Actu ne nommant aucune piscine et sans effet sur les horaires (recrutement…) : "pools": [] et "allPools": [].
Réponds uniquement avec le JSON demandé.`;
}

function geminiRequest(
  news: ShortNews,
  apiKey: string,
  thinkingConfig: Record<string, unknown> | null
): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(news) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      }),
      signal: AbortSignal.timeout(25_000),
    }
  );
}

async function callGemini(news: ShortNews, apiKey: string): Promise<NewsReading | null> {
  // Le mode « réflexion » (défaut des Gemini 3.x) multiplie la latence sans
  // gain sur cette extraction : on le coupe. Retry sans l'option pour les
  // modèles qui ne la connaissent pas (2.5 : thinkingBudget, pas thinkingLevel).
  let res = await geminiRequest(news, apiKey, { thinkingLevel: "minimal" });
  if (res.status === 400) res = await geminiRequest(news, apiKey, null);
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini : réponse sans texte");
  return parseReading(JSON.parse(text));
}

// Mémo au niveau de l'instance : une actu n'est interprétée qu'une fois par
// processus (les 12 pages portent le même bloc « En bref »). Succès uniquement —
// un échec sera retenté au passage suivant du cron.
const memo = new Map<string, NewsReading>();

// Client Supabase propre plutôt que ./supabase : son « server-only » refuse
// l'import dans les scripts (check-live), qui — privés du cache durable —
// rappelaient Gemini à chaque exécution et brûlaient le quota journalier.
let cachedDb: SupabaseClient | null = null;
async function dbOrNull(): Promise<SupabaseClient | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  if (!cachedDb) {
    const { createClient } = await import("@supabase/supabase-js");
    cachedDb = createClient(url, key, { auth: { persistSession: false } });
  }
  return cachedDb;
}

/**
 * Interprète les actus « En bref » : Map lecture-par-actu (clé = newsKey) à
 * passer à analyzeDay. Incomplète ou vide en cas de pépin — jamais d'exception.
 */
export async function interpretShorts(shorts: ShortNews[]): Promise<NewsReadings> {
  const out: NewsReadings = new Map();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return out;

  const items = new Map<string, { news: ShortNews; hash: string }>();
  for (const news of shorts) {
    if (!news.title) continue;
    const key = newsKey(news);
    if (!items.has(key)) items.set(key, { news, hash: hashKey(key) });
  }
  if (items.size === 0) return out;

  for (const [key, { hash }] of items) {
    const hit = memo.get(hash);
    if (hit) out.set(key, hit);
  }

  const missing = [...items.entries()].filter(([key]) => !out.has(key));
  if (missing.length === 0) return out;

  const db = await dbOrNull();
  if (db) {
    try {
      const { data, error } = await db
        .from("news_readings")
        .select("hash,reading")
        .in(
          "hash",
          missing.map(([, it]) => it.hash)
        );
      if (error) throw error;
      const byHash = new Map((data ?? []).map((r) => [r.hash as string, r.reading]));
      for (const [key, it] of missing) {
        const reading = byHash.has(it.hash) ? parseReading(byHash.get(it.hash)) : null;
        if (reading) {
          memo.set(it.hash, reading);
          out.set(key, reading);
        }
      }
    } catch (err) {
      console.error("[news-llm] cache illisible :", err instanceof Error ? err.message : err);
    }
  }

  // Séquentiel : une rafale parallèle déclenche le limiteur de débit du free
  // tier (des lectures sautent au premier passage). ~1 s par actu, rare.
  const toCall = missing.filter(([key]) => !out.has(key));
  for (const [key, it] of toCall) {
    try {
      const reading = await callGemini(it.news, apiKey);
      if (!reading) continue;
      memo.set(it.hash, reading);
      out.set(key, reading);
      if (db) {
        const { error } = await db.from("news_readings").upsert(
          {
            hash: it.hash,
            title: it.news.title,
            reading,
            model: model(),
          },
          { onConflict: "hash" }
        );
        if (error) throw error;
      }
    } catch (err) {
      console.error(
        `[news-llm] lecture « ${it.news.title.slice(0, 60)} » sautée :`,
        err instanceof Error ? err.message : err
      );
      // Quota journalier épuisé : les appels suivants échoueraient pareil
      if (err instanceof Error && err.message.includes("HTTP 429")) break;
    }
  }
  return out;
}
