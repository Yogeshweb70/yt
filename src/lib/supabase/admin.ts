import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: SupabaseClient | null = null;
let testOverride: SupabaseClient | null = null;

/** Test seam: inject an in-memory fake client (reliability tests only). */
export function __setSupabaseClientForTests(c: SupabaseClient | null): void {
  testOverride = c;
}

/**
 * Service-role Supabase client for server-side use only. Bypasses RLS —
 * never expose to the browser. In single-channel mode all pipeline writes
 * go through this.
 */
export function supabaseAdmin(): SupabaseClient {
  if (testOverride) return testOverride;
  if (client) return client;
  client = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
