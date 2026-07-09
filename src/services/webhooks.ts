import "server-only";
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

export type WebhookEvent =
  | "render.complete"
  | "upload.complete"
  | "publish.complete"
  | "analytics.updated"
  | "error";

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
}

export async function registerWebhook(url: string, events: WebhookEvent[], secret?: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("webhooks")
    .insert({ url, events, secret: secret ?? null, active: true })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Delivers an event to all subscribed webhooks (Step 12). HMAC-signs the body
 * with each hook's secret (x-signature). Best-effort with delivery logging;
 * never throws into the caller.
 */
export async function emitEvent(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const { data } = await supabaseAdmin()
    .from("webhooks")
    .select("id, url, events, secret, active")
    .eq("active", true);
  const hooks = ((data as WebhookRow[]) ?? []).filter((h) => h.events.includes(event));
  if (hooks.length === 0) return;

  const body = JSON.stringify({ event, payload, ts: Date.now() });
  await Promise.all(
    hooks.map(async (h) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (h.secret) headers["x-signature"] = createHmac("sha256", h.secret).update(body).digest("hex");
      let status = 0;
      try {
        const res = await fetch(h.url, { method: "POST", headers, body });
        status = res.status;
      } catch {
        status = 0;
      }
      await supabaseAdmin()
        .from("webhook_deliveries")
        .insert({ webhook_id: h.id, event, status, ok: status >= 200 && status < 300 })
        .then(() => undefined, () => undefined);
    }),
  );
  await log.info("webhooks", `emitted ${event} to ${hooks.length} hook(s)`);
}
