import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/services/audit";

export type TemplateKind = "script" | "prompt" | "scene" | "voice" | "seo" | "thumbnail";

/** Reusable content templates (Step 8). Additive: generation reads the active
 *  template for a kind when present; otherwise falls back to built-in prompts. */
export async function upsertTemplate(
  kind: TemplateKind,
  name: string,
  content: Record<string, unknown>,
  activate = false,
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("templates")
    .insert({ kind, name, content, active: activate })
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  if (activate) await activateTemplate(kind, id);
  await audit("template.upsert", { kind, name });
  return id;
}

export async function activateTemplate(kind: TemplateKind, id: string): Promise<void> {
  const db = supabaseAdmin();
  await db.from("templates").update({ active: false }).eq("kind", kind);
  await db.from("templates").update({ active: true }).eq("id", id);
  await audit("template.activate", { kind, id });
}

export async function getActiveTemplate(kind: TemplateKind): Promise<Record<string, unknown> | null> {
  const { data } = await supabaseAdmin()
    .from("templates")
    .select("content")
    .eq("kind", kind)
    .eq("active", true)
    .maybeSingle();
  return (data as { content: Record<string, unknown> } | null)?.content ?? null;
}
