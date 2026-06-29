import { POOLS, poolUrl } from "@/lib/pools";
import { fetchPoolPage } from "@/lib/scrape";
import { analyzeDay, exceptionalSignature, notificationBody } from "@/lib/parse-schedule";
import { getWeekInfo } from "@/lib/today";
import { getClosureSignatures, setClosureSignature, getSubscriptionsForPool } from "@/lib/push-store";
import { sendPush } from "@/lib/push-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://toulouse-piscines.vercel.app/";

export async function GET(req: Request) {
  // Protégé par un secret partagé (en-tête Authorization: Bearer <CRON_SECRET>)
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = (await getWeekInfo())[0];
  const previous = await getClosureSignatures();
  const results: { slug: string; changed: boolean; notified?: number }[] = [];

  for (const pool of POOLS) {
    try {
      // `fresh: true` : on contourne le Data Cache de Next pour scruter la page
      // en direct à chaque passage du cron (sinon détection retardée ~1 h).
      const page = await fetchPoolPage(poolUrl(pool), { fresh: true });
      const day = analyzeDay(page, today, pool);
      const signature = exceptionalSignature(day) ?? "";
      const before = previous.get(pool.slug) ?? "";

      if (signature === before) {
        results.push({ slug: pool.slug, changed: false });
        continue;
      }

      // Ne notifier que l'apparition d'un NOUVEL évènement exceptionnel
      // (pas la disparition / réouverture — on met juste l'état à jour).
      if (signature) {
        // Titre = piscine concernée ; corps = la news en clair (titre + détail).
        const body = notificationBody(day);
        const subs = await getSubscriptionsForPool(pool.slug);
        let sent = 0;
        for (const sub of subs) {
          if (await sendPush(sub, { title: pool.name, body, url: SITE, slug: pool.slug }))
            sent++;
        }
        results.push({ slug: pool.slug, changed: true, notified: sent });
      } else {
        results.push({ slug: pool.slug, changed: true, notified: 0 });
      }
      await setClosureSignature(pool.slug, signature);
    } catch (err) {
      results.push({ slug: pool.slug, changed: false });
      console.error(`cron ${pool.slug}:`, err instanceof Error ? err.message : err);
    }
  }

  return Response.json({ ok: true, checkedAt: new Date().toISOString(), results });
}
