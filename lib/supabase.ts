import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** true si les identifiants Supabase sont présents (sinon : repli sans persistance). */
export function isConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/** Client Supabase partagé (clé secrète, côté serveur uniquement). */
export function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase non configuré (SUPABASE_URL / SUPABASE_SECRET_KEY)");
  if (!cached) cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
