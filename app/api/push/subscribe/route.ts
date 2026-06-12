import { saveSubscription } from "@/lib/push-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { subscription, pools } = await req.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return Response.json({ error: "Abonnement invalide" }, { status: 400 });
    }
    await saveSubscription(subscription, Array.isArray(pools) ? pools.slice(0, 50) : []);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
