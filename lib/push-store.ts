import "server-only";
import { db } from "./supabase";

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** slugs des piscines suivies ; tableau vide = toutes les piscines */
  pools: string[];
}

export async function saveSubscription(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  pools: string[]
): Promise<void> {
  await db()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        pools,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db().from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function getAllSubscriptions(): Promise<StoredSubscription[]> {
  const { data, error } = await db()
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,pools");
  if (error) throw error;
  return (data ?? []) as StoredSubscription[];
}

/** Abonnements concernés par une piscine : ceux qui la suivent, ou « toutes ». */
export async function getSubscriptionsForPool(slug: string): Promise<StoredSubscription[]> {
  const all = await getAllSubscriptions();
  return all.filter((s) => !s.pools || s.pools.length === 0 || s.pools.includes(slug));
}

export async function getClosureSignatures(): Promise<Map<string, string>> {
  const { data, error } = await db().from("pool_closure_state").select("slug,signature");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.slug as string, (r.signature as string) ?? ""]));
}

export async function setClosureSignature(slug: string, signature: string): Promise<void> {
  await db()
    .from("pool_closure_state")
    .upsert({ slug, signature, updated_at: new Date().toISOString() }, { onConflict: "slug" });
}
