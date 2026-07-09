import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

export type JobType =
  | "discover"
  | "rank"
  | "research"
  | "script"
  | "scenes"
  | "voice"
  | "manifest"
  | "images"
  | "render"
  | "optimize"
  | "publish"
  | "analytics_sync"
  | "report";

interface JobRow {
  id: string;
  status: "pending" | "running" | "done" | "failed";
  result: unknown;
  attempts: number;
  max_attempts: number;
}

/**
 * Idempotent, resumable stage runner.
 * - Same `idempotencyKey` reuses a completed result (resume/idempotency).
 * - On failure, increments attempts and rethrows; a re-run retries until
 *   `max_attempts` is exhausted.
 */
export async function runStage<T>(
  type: JobType,
  idempotencyKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const db = supabaseAdmin();

  const { data: existing } = await db
    .from("jobs")
    .select("id, status, result, attempts, max_attempts")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  const job = existing as JobRow | null;

  if (job?.status === "done") {
    return job.result as T;
  }
  if (job && job.attempts >= job.max_attempts) {
    throw new Error(`Job ${idempotencyKey} exhausted ${job.max_attempts} attempts`);
  }

  const jobId = job?.id ?? (await createJob(type, idempotencyKey));
  await db.from("jobs").update({ status: "running" }).eq("id", jobId);

  try {
    const result = await fn();
    await db
      .from("jobs")
      .update({ status: "done", result: result as object, error: null })
      .eq("id", jobId);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from("jobs")
      .update({
        status: "failed",
        error: message,
        attempts: (job?.attempts ?? 0) + 1,
      })
      .eq("id", jobId);
    await log.error("jobs", `stage ${type} failed`, { idempotencyKey, message });
    throw e;
  }
}

async function createJob(type: JobType, idempotencyKey: string): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .from("jobs")
    .insert({ type, idempotency_key: idempotencyKey, status: "pending", attempts: 0 })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
