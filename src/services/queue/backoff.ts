// Pure queue decision logic — no I/O, unit-tested in backoff.test.ts.

export interface QueueJobLike {
  status: string;
  run_after: string; // ISO
  depends_on: string[];
  locked_at: string | null;
}

const BASE_MS = Number(process.env.QUEUE_BACKOFF_BASE_MS ?? 2000);
const CAP_MS = Number(process.env.QUEUE_BACKOFF_CAP_MS ?? 300_000);

/** Exponential backoff with a cap. attempt is 0-based (0 => first retry). */
export function computeBackoffMs(attempt: number, base = BASE_MS, cap = CAP_MS): number {
  if (attempt < 0) attempt = 0;
  return Math.min(cap, base * 2 ** attempt);
}

/** A job moves to the dead-letter queue once attempts reach max. */
export function shouldDeadLetter(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

/**
 * Whether a job can be claimed now: pending, its run_after has passed, its
 * lock (if any) is stale, and all dependencies are satisfied.
 */
export function isClaimable(
  job: QueueJobLike,
  nowMs: number,
  depsDone: boolean,
  lockStaleMs = 600_000,
): boolean {
  if (job.status !== "pending") return false;
  if (Date.parse(job.run_after) > nowMs) return false;
  if (job.locked_at && nowMs - Date.parse(job.locked_at) < lockStaleMs) return false;
  return depsDone;
}
