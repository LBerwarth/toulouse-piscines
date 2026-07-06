import { exceptionalSignature, notificationBody } from "@/lib/parse-schedule";
import { refreshStatusReport } from "@/lib/status";
import { getClosureSignatures, setClosureSignature, getAllSubscriptions } from "@/lib/push-store";
import { sendPush, type PushPayload } from "@/lib/push-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://toulouse-piscines.vercel.app/";

/** Nouvel évènement exceptionnel détecté sur une piscine pendant ce passage. */
interface PoolEvent {
  slug: string;
  name: string;
  body: string;
}

/**
 * À partir de ce nombre de piscines touchées pour un même abonnement, on envoie
 * UNE notification récapitulative au lieu d'une par piscine : une vague
 * (canicule, grève…) concerne souvent la plupart des piscines à la fois, et une
 * rafale de 12 notifications quasi identiques pousse à les désactiver.
 */
const BUNDLE_THRESHOLD = 3;

function bundlePayload(events: PoolEvent[]): PushPayload {
  const names = events.map((e) => e.name).join(" · ");
  const bodies = new Set(events.map((e) => e.body));
  // Même annonce partout (cas typique d'une vague) : la mesure d'abord, puis
  // les piscines. Sinon, la liste des piscines et le détail dans l'app.
  const body =
    bodies.size === 1
      ? `${events[0].body} : ${names}`
      : `${names} — détail dans l'application.`;
  return {
    title: `Changements dans ${events.length} piscines`,
    body: body.slice(0, 300),
    url: SITE,
    slug: "recap",
  };
}

export async function GET(req: Request) {
  // Protégé par un secret partagé (en-tête Authorization: Bearer <CRON_SECRET>)
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Un seul rescan par passage : il alimente le cache partagé servi aux
  // visiteurs (la page ne scrape plus elle-même) ET la détection de fermetures.
  const report = await refreshStatusReport();
  const previous = await getClosureSignatures();
  const results: { slug: string; changed: boolean }[] = [];
  const events: PoolEvent[] = [];
  // Signatures écrites APRÈS l'envoi : si l'envoi plante, le prochain passage
  // redétecte et renvoie (doublon possible, dédupliqué par le tag du SW) —
  // préférable à une notification perdue.
  const signatureUpdates: { slug: string; signature: string }[] = [];

  for (const pool of report.pools) {
    const today = pool.week?.[0];
    if (!pool.ok || !today) {
      // Page illisible : on ne touche pas à la signature (pas de fausse alerte,
      // pas de « réouverture » fantôme au retour de la page).
      results.push({ slug: pool.slug, changed: false });
      if (pool.error) console.error(`cron ${pool.slug}:`, pool.error);
      continue;
    }
    const signature = exceptionalSignature(today) ?? "";
    const before = previous.get(pool.slug) ?? "";

    if (signature === before) {
      results.push({ slug: pool.slug, changed: false });
      continue;
    }

    // Ne notifier que l'apparition d'un NOUVEL évènement exceptionnel
    // (pas la disparition / réouverture — on met juste l'état à jour).
    if (signature) {
      events.push({ slug: pool.slug, name: pool.name, body: notificationBody(today) });
    }
    results.push({ slug: pool.slug, changed: true });
    signatureUpdates.push({ slug: pool.slug, signature });
  }

  // Envoi groupé par abonnement, tous évènements du passage confondus.
  let notified = 0;
  if (events.length > 0) {
    const subs = await getAllSubscriptions();
    for (const sub of subs) {
      const followed = sub.pools ?? [];
      const affected =
        followed.length === 0 ? events : events.filter((e) => followed.includes(e.slug));
      if (affected.length === 0) continue;
      const payloads: PushPayload[] =
        affected.length >= BUNDLE_THRESHOLD
          ? [bundlePayload(affected)]
          : affected.map((e) => ({ title: e.name, body: e.body, url: SITE, slug: e.slug }));
      for (const payload of payloads) {
        if (await sendPush(sub, payload)) notified++;
      }
    }
  }

  for (const { slug, signature } of signatureUpdates) {
    try {
      await setClosureSignature(slug, signature);
    } catch (err) {
      console.error(`cron signature ${slug}:`, err instanceof Error ? err.message : err);
    }
  }

  return Response.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    results,
    events: events.map((e) => e.slug),
    notified,
  });
}
