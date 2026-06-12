import { removeSubscription } from "@/lib/push-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { endpoint } = await req.json();
    if (typeof endpoint === "string" && endpoint) await removeSubscription(endpoint);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
