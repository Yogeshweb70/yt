import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

type NotifyKind =
  | "ctr_drop"
  | "retention_drop"
  | "upload_failed"
  | "quota_low"
  | "top_performer"
  | "recommendation";

/** Records a notification and best-effort posts to NOTIFY_WEBHOOK_URL. */
export async function notify(
  kind: NotifyKind,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin()
    .from("notifications")
    .insert({ kind, message, meta })
    .then(() => undefined, () => undefined);

  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, meta }),
      });
    } catch {
      /* best-effort */
    }
  }
  await log.info("notify", `${kind}: ${message}`, meta);
}
