import { getAllSubscriptions } from "@/lib/push-store";
import { sendPush } from "@/lib/push-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint de vérification : envoie une notification de test à TOUS les
// abonnés. Protégé par CRON_SECRET. (Sans valeur fonctionnelle en production —
// utile seulement pour confirmer que la chaîne push fonctionne.)
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const subs = await getAllSubscriptions();
  let sent = 0;
  for (const sub of subs) {
    if (
      await sendPush(sub, {
        title: "Test — Piscines de Toulouse",
        body: "Les notifications fonctionnent ✅",
        url: "https://toulouse-piscines.vercel.app/",
        slug: "test",
      })
    )
      sent++;
  }
  return Response.json({ subscriptions: subs.length, sent });
}
