"use server";

import { enqueue } from "@/services/queue/queue";
import { log } from "@/lib/logger";

export interface TriggerResult {
  ok: boolean;
  jobId?: string;
  error?: string;
}

/**
 * "Publish now" — enqueues a one-off content run that produces and publishes a
 * video on demand, independent of the daily schedule. A unique idempotency key
 * (timestamped) ensures it never collapses into the day-scoped scheduled run,
 * and the worker drains it alongside the scheduled jobs (concurrent), so the
 * rest of the pipeline keeps working at the same time.
 *
 * NOTE: This only ENQUEUES the job. A worker (ffmpeg/chromium host with the
 * OpenAI / ElevenLabs / R2 keys set) must be running to actually render and
 * upload it — see RUNBOOK.md. On Vercel-only deployments nothing will process it.
 */
export async function triggerVideoNow(): Promise<TriggerResult> {
  try {
    const dayStamp = new Date().toISOString().slice(0, 10);
    const jobId = await enqueue("content", {
      payload: { dayStamp, immediate: true },
      idempotencyKey: `content:ondemand:${new Date().toISOString()}`,
      priority: 20, // ahead of the daily run (10) so it starts as soon as a slot frees
      timeoutMs: 15 * 60_000,
    });
    await log.info("dashboard", `on-demand video enqueued (job ${jobId})`);
    return { ok: true, jobId };
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown error";
    await log.error("dashboard", `on-demand enqueue failed: ${error}`);
    return { ok: false, error };
  }
}
