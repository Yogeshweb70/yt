import "server-only";
import { claimNext, complete, fail, type JobRow } from "@/services/queue/queue";
import { HANDLERS } from "@/services/queue/handlers";
import { emitEvent, type WebhookEvent } from "@/services/webhooks";
import { withSpan } from "@/lib/trace";
import { log } from "@/lib/logger";

// Maps a completed job type to its webhook event (Step 12).
const EVENT_OF: Record<string, WebhookEvent> = {
  content: "render.complete",
  autopilot: "publish.complete",
  analytics: "analytics.updated",
};

function withTimeout<T>(p: Promise<T>, ms: number | null): Promise<T> {
  if (!ms) return p;
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`job timeout after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Drains up to `max` ready jobs (Step 1/4). Designed to be invoked repeatedly
 * by a scheduler (cron / loop) rather than as a long-lived request — each call
 * is bounded, and unfinished work simply waits for the next tick. Heavy job
 * types (autopilot) must run where ffmpeg + chromium are available.
 */
export async function runTick(
  workerId: string,
  max = 5,
  types?: string[],
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < max; i++) {
    const job: JobRow | null = await claimNext(workerId, types);
    if (!job) break;

    const handler = HANDLERS[job.type];
    if (!handler) {
      await fail(job, `no handler for type ${job.type}`);
      failed++;
      continue;
    }

    try {
      const result = await withSpan(`job:${job.type}`, () =>
        withTimeout(handler(job.payload ?? {}), job.timeout_ms),
      );
      await complete(job.id, result);
      processed++;
      const evt = EVENT_OF[job.type];
      if (evt) await emitEvent(evt, { jobId: job.id, type: job.type, result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await fail(job, message);
      failed++;
      await emitEvent("error", { jobId: job.id, type: job.type, error: message });
    }
  }

  if (processed || failed) {
    await log.info("worker", `tick done`, { workerId, processed, failed });
  }
  return { processed, failed };
}
