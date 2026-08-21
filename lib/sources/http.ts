const REVALIDATE_SECONDS = 1800;

/**
 * Récupère une page d'horaires en HTML.
 * @param opts.fresh force une requête réseau (sans le Data Cache de Next) —
 *   utilisé quand on rafraîchit volontairement le cache applicatif (cf. status.ts).
 */
export async function fetchHtml(url: string, opts?: { fresh?: boolean }): Promise<string> {
  const res = await fetch(url, {
    // On ne peut pas combiner `cache` et `next.revalidate` : soit on force le
    // réseau, soit on s'appuie sur le Data Cache (30 min).
    ...(opts?.fresh ? { cache: "no-store" as const } : { next: { revalidate: REVALIDATE_SECONDS } }),
    // Un site de mairie qui pend sans répondre bloquerait tout le scan (et le
    // rendu, lors d'un scrape en direct) : on abandonne, la piscine passe en
    // erreur et le rapport garde son dernier bon état.
    signal: AbortSignal.timeout(15_000),
    // En-têtes proches d'un navigateur : depuis les IP datacenter de Vercel, la
    // source (Varnish + protection en façade) renvoyait sinon une page vide en
    // HTTP 200 à notre ancien User-Agent « bot », d'où des rescans à zéro
    // horaire pris à tort pour une maintenance. Accès légitime à des données
    // publiques pour une appli gratuite et non commerciale.
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en récupérant ${url}`);
  }
  return decode(await res.arrayBuffer(), res.headers.get("content-type"));
}

/**
 * Décode selon le charset annoncé : certains sites de mairie (Hersain-Bocage)
 * servent encore de l'ISO-8859-1, que `Response.text()` mangerait en « rÃ©servÃ© ».
 * Repli sur UTF-8 : la plupart des pages n'annoncent rien et sont en UTF-8.
 */
function decode(body: ArrayBuffer, contentType: string | null): string {
  const declared = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(body);
  const charset = declared ?? sniffMetaCharset(utf8);
  if (!charset || /^utf-?8$/i.test(charset)) {
    // Charset absent ou UTF-8 annoncé à tort (page latine servie en « utf-8 ») :
    // on tranche sur le contenu, U+FFFD ne pouvant venir que d'un mauvais décodage.
    return utf8.includes("�") ? new TextDecoder("windows-1252").decode(body) : utf8;
  }
  try {
    return new TextDecoder(charset, { fatal: false }).decode(body);
  } catch {
    return utf8;
  }
}

function sniffMetaCharset(html: string): string | undefined {
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(html.slice(0, 4096))?.[1];
}
