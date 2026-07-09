import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";

export interface BrandSettings {
  fonts: string | null;
  primary_color: string | null;
  logo_url: string | null;
  intro_url: string | null;
  outro_url: string | null;
  watermark_url: string | null;
  music_url: string | null;
  voice_id: string | null;
}

/** Singleton brand settings (Step 9). Single-channel: one row (id=true). */
export async function getBrand(): Promise<BrandSettings | null> {
  const { data } = await supabaseAdmin()
    .from("brand_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  return (data as BrandSettings | null) ?? null;
}

export async function setBrand(patch: Partial<BrandSettings>): Promise<void> {
  await supabaseAdmin()
    .from("brand_settings")
    .upsert({ id: true, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" });
  await audit("brand.update", { keys: Object.keys(patch) });
}
