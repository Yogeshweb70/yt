import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Append-only audit trail (Step 14). Never throws — auditing must not break flows. */
export async function audit(
  action: string,
  meta: Record<string, unknown> = {},
  actor = "system",
): Promise<void> {
  try {
    await supabaseAdmin().from("audit_logs").insert({ action, actor, meta });
  } catch {
    /* best-effort */
  }
}
