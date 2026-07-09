import "server-only";
import { enqueue } from "@/services/queue/queue";
import { log } from "@/lib/logger";

/**
 * Central pipeline controller (Step 4). Enqueues a durable daily DAG:
 *   content ─▶ (fans out autopilot per manifest, done inside the content handler)
 *   analytics (independent)
 *   report:daily (after analytics)
 * Idempotency keys are day-scoped so re-dispatching the same day is a no-op.
 *
 * NOTE: `content` currently selects ONE best topic → ~2 manifests (en/hi), so
 * this does not yet yield 3 DISTINCT videos/day. Producing N distinct videos
 * needs top-N topic selection in Phase-2 ranking (tracked in CONTINUE).
 */
export async function dispatchDailyRun(): Promise<{ ids: string[] }> {
  const day = new Date().toISOString().slice(0, 10);

  const content = await enqueue("content", {
    payload: { dayStamp: day },
    idempotencyKey: `content:${day}`,
    priority: 10,
    timeoutMs: 15 * 60_000,
  });

  const analytics = await enqueue("analytics", {
    idempotencyKey: `analytics:${day}`,
    priority: 3,
  });

  const report = await enqueue("report", {
    payload: { period: "daily" },
    idempotencyKey: `report:daily:${day}`,
    priority: 1,
    dependsOn: [analytics],
  });

  await log.info("pipeline-manager", `dispatched daily run ${day}`);
  return { ids: [content, analytics, report] };
}
