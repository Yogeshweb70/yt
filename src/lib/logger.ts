import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Level = "info" | "warn" | "error";

/** Structured logger: console + best-effort persist to the `logs` table.
 *  Never throws (logging must not break the pipeline). */
async function write(
  level: Level,
  scope: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const line = `[${level}] ${scope}: ${message}`;
  if (level === "error") console.error(line, meta ?? "");
  else console.log(line, meta ?? "");
  try {
    await supabaseAdmin().from("logs").insert({
      level,
      scope,
      message,
      meta: meta ?? null,
    });
  } catch {
    /* logging is best-effort */
  }
}

export const log = {
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    write("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    write("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    write("error", scope, message, meta),
};
