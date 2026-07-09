import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";

/**
 * Versioned AI prompts (Step 10): create versions, activate, rollback, and
 * attach measured performance. Additive — the built-in `src/prompts` remain the
 * default; opt-in consumers can read the active version by name.
 */
export async function createPromptVersion(
  name: string,
  template: string,
): Promise<{ id: string; version: number }> {
  const { data: last } = await supabaseAdmin()
    .from("prompt_versions")
    .select("version")
    .eq("name", name)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((last as { version: number } | null)?.version ?? 0) + 1;
  const { data, error } = await supabaseAdmin()
    .from("prompt_versions")
    .insert({ name, version, template, active: version === 1 })
    .select("id")
    .single();
  if (error) throw error;
  await audit("prompt.version.create", { name, version });
  return { id: (data as { id: string }).id, version };
}

export async function activatePromptVersion(name: string, version: number): Promise<void> {
  const db = supabaseAdmin();
  await db.from("prompt_versions").update({ active: false }).eq("name", name);
  await db.from("prompt_versions").update({ active: true }).eq("name", name).eq("version", version);
  await audit("prompt.version.activate", { name, version });
}

/** Rolls back to the previous active-eligible version (highest below current). */
export async function rollbackPrompt(name: string): Promise<number | null> {
  const { data } = await supabaseAdmin()
    .from("prompt_versions")
    .select("version, active")
    .eq("name", name)
    .order("version", { ascending: false });
  const rows = (data as { version: number; active: boolean }[]) ?? [];
  const currentIdx = rows.findIndex((r) => r.active);
  const target = rows[currentIdx + 1];
  if (!target) return null;
  await activatePromptVersion(name, target.version);
  return target.version;
}

export async function getActivePrompt(name: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("prompt_versions")
    .select("template")
    .eq("name", name)
    .eq("active", true)
    .maybeSingle();
  return (data as { template: string } | null)?.template ?? null;
}
