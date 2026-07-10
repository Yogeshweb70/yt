import { NextResponse } from "next/server";
import { enqueue } from "@/services/queue/queue";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Publish a video now" — enqueues a one-off content run that produces and
 * publishes a video on demand, independent of the daily schedule. A unique
 * (timestamped) idempotency key ensures it never collapses into the day-scoped
 * scheduled run, and the worker drains it alongside the scheduled jobs, so the
 * rest of the pipeline keeps working at the same time.
 *
 * NOTE: this only ENQUEUES the job — a worker (ffmpeg/chromium host with the
 * OpenAI / ElevenLabs / R2 keys) must be running to actually render & upload it.
 */
export async function POST() {
  try {
    const dayStamp = new Date().toISOString().slice(0, 10);
    const jobId = await enqueue("content", {
      payload: { dayStamp, immediate: true },
      idempotencyKey: `content:ondemand:${new Date().toISOString()}`,
      priority: 20,
      timeoutMs: 15 * 60_000,
    });
    await log.info("dashboard", `on-demand video enqueued (job ${jobId})`);
    return NextResponse.json({ ok: true, jobId });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown error";
    await log.error("dashboard", `on-demand enqueue failed: ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
