import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, decrypt, fingerprint } from "@/lib/crypto";
import { audit } from "@/services/audit";

export type Provider =
  | "openai"
  | "elevenlabs"
  | "google"
  | "cloudflare"
  | "supabase";

/** Stores an encrypted provider credential (Step 5/15). */
export async function setSecret(provider: Provider, value: string): Promise<void> {
  await supabaseAdmin().from("secrets").upsert(
    {
      provider,
      value: encrypt(value),
      fingerprint: fingerprint(value),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  await audit("secret.set", { provider });
}

/** Returns the decrypted secret, or falls back to the matching env var. */
export async function getSecret(provider: Provider): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("secrets")
    .select("value")
    .eq("provider", provider)
    .maybeSingle();
  const stored = (data as { value: string } | null)?.value;
  if (stored) return decrypt(stored);
  return envFallback(provider);
}

function envFallback(provider: Provider): string | null {
  const map: Record<Provider, string> = {
    openai: "OPENAI_API_KEY",
    elevenlabs: "ELEVENLABS_API_KEY",
    google: "GOOGLE_CLIENT_SECRET",
    cloudflare: "R2_SECRET_ACCESS_KEY",
    supabase: "SUPABASE_SERVICE_ROLE_KEY",
  };
  return process.env[map[provider]] ?? null;
}

/** Lightweight liveness validation for a provided key. */
export async function validateSecret(provider: Provider, value: string): Promise<boolean> {
  try {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${value}` },
      });
      return r.ok;
    }
    if (provider === "elevenlabs") {
      const r = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": value },
      });
      return r.ok;
    }
    // google/cloudflare/supabase validated indirectly; accept non-empty.
    return value.length > 0;
  } catch {
    return false;
  }
}

/** Masked status for the settings UI (never returns the secret). */
export async function secretStatus(): Promise<{ provider: string; set: boolean; fingerprint: string | null }[]> {
  const { data } = await supabaseAdmin().from("secrets").select("provider, fingerprint");
  const rows = (data as { provider: string; fingerprint: string }[]) ?? [];
  const providers: Provider[] = ["openai", "elevenlabs", "google", "cloudflare", "supabase"];
  return providers.map((p) => {
    const row = rows.find((r) => r.provider === p);
    return { provider: p, set: !!row, fingerprint: row?.fingerprint ?? null };
  });
}
