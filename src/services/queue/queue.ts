import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeBackoffMs, shouldDeadLetter, isClaimable } from "@/services/queue/backoff";
import { log } from "@/lib/logger";

export interface EnqueueOptions {
  payload?: Record<string, unknown>;
  priority?: number;
  runAfter?: string;
  maxAttempts?: number;
  dependsOn?: string[];
  timeoutMs?: number;
  idempotencyKey?: string;
  channelId?: string | null;
}

interface JobRow {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  run_after: string;
  depends_on: string[];
  locked_at: string | null;
  timeout_ms: number | null;
}

/** Enqueue a job. If idempotencyKey collides, returns the existing job id. */
export async function enqueue(type: string, opts: EnqueueOptions = {}): Promise<string> {
  const db = supabaseAdmin();
  if (opts.idempotencyKey) {
    const { data: existing } = await db
      .from("queue_jobs")
      .select("id")
      .eq("idempotency_key", opts.idempotencyKey)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;
  }
  const { data, error } = await db
    .from("queue_jobs")
    .insert({
      type,
      payload: opts.payload ?? {},
      priority: opts.priority ?? 0,
      run_after: opts.runAfter ?? new Date().toISOString(),
      max_attempts: opts.maxAttempts ?? 3,
      depends_on: opts.dependsOn ?? [],
      timeout_ms: opts.timeoutMs ?? null,
      idempotency_key: opts.idempotencyKey ?? null,
      channel_id: opts.channelId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function depsSatisfied(depIds: string[]): Promise<boolean> {
  if (!depIds.length) return true;
  const { data } = await supabaseAdmin()
    .from("queue_jobs")
    .select("id, status")
    .in("id", depIds);
  const rows = (data as { id: string; status: string }[]) ?? [];
  return depIds.every((id) => rows.find((r) => r.id === id)?.status === "done");
}

/**
 * Atomically claims the next ready job for `workerId`. Uses an optimistic
 * status-guarded update so a job claimed by another worker fails the guard and
 * is skipped. Returns null when nothing is ready.
 */
export async function claimNext(workerId: string, types?: string[]): Promise<JobRow | null> {
  const db = supabaseAdmin();
  let q = db
    .from("queue_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);
  if (types?.length) q = q.in("type", types);
  const { data } = await q;
  const candidates = (data as JobRow[]) ?? [];
  const now = Date.now();

  for (const job of candidates) {
    const depsOk = await depsSatisfied(job.depends_on ?? []);
    if (!isClaimable({ ...job }, now, depsOk)) continue;
    const { data: locked } = await db
      .from("queue_jobs")
      .update({
        status: "running",
        locked_by: workerId,
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "pending") // guard: lose the race => 0 rows
      .select("*")
      .maybeSingle();
    if (locked) return locked as JobRow;
  }
  return null;
}

export async function complete(id: string, result: unknown): Promise<void> {
  await supabaseAdmin()
    .from("queue_jobs")
    .update({
      status: "done",
      result: result as object,
      progress: 100,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "running"); // don't resurrect a job cancelled mid-run
}

/** Records failure; retries with backoff or moves to the dead-letter queue. */
export async function fail(job: JobRow, message: string): Promise<void> {
  const attempts = job.attempts + 1;
  const dead = shouldDeadLetter(attempts, job.max_attempts);
  const runAfter = new Date(Date.now() + computeBackoffMs(attempts - 1)).toISOString();
  await supabaseAdmin()
    .from("queue_jobs")
    .update({
      status: dead ? "dead" : "pending",
      attempts,
      error: message,
      run_after: dead ? job.run_after : runAfter,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "running"); // a job cancelled mid-run must not be retried
  if (dead) await log.error("queue", `job ${job.id} (${job.type}) dead-lettered`, { message });
}

/** Cancel one job. Only affects still-active jobs (pending/running); a job
 *  already running in a worker finishes its current handler, but is marked so
 *  it won't retry and its dependents stay blocked. Returns rows affected. */
export async function cancel(id: string): Promise<number> {
  const { data } = await supabaseAdmin()
    .from("queue_jobs")
    .update({ status: "cancelled", locked_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "running"])
    .select("id");
  return (data as { id: string }[] | null)?.length ?? 0;
}

/** Cancel every active job (pending + running) in one shot. Returns the count. */
export async function cancelAllActive(): Promise<number> {
  const { data } = await supabaseAdmin()
    .from("queue_jobs")
    .update({ status: "cancelled", locked_at: null, updated_at: new Date().toISOString() })
    .in("status", ["pending", "running"])
    .select("id");
  return (data as { id: string }[] | null)?.length ?? 0;
}

export async function setProgress(id: string, pct: number, stage?: string): Promise<void> {
  const patch: { progress: number; stage?: string } = { progress: pct };
  if (stage !== undefined) patch.stage = stage;
  await supabaseAdmin().from("queue_jobs").update(patch).eq("id", id);
}

export type { JobRow };
