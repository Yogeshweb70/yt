import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

/**
 * Times an operation, emits a structured log line, and best-effort persists a
 * span to `traces` for latency dashboards (Step 5/6). Never swallows the
 * operation's result or error; tracing failures are ignored.
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  meta: Record<string, unknown> = {},
): Promise<T> {
  const start = Date.now();
  let ok = true;
  try {
    return await fn();
  } catch (e) {
    ok = false;
    throw e;
  } finally {
    const durationMs = Date.now() - start;
    void log.info("trace", `${name} ${durationMs}ms ${ok ? "ok" : "err"}`, meta);
    void supabaseAdmin()
      .from("traces")
      .insert({ name, duration_ms: durationMs, ok, meta })
      .then(() => undefined, () => undefined);
  }
}
