import { NextResponse, type NextRequest } from "next/server";
import { enqueue } from "@/services/queue/queue";
import { log } from "@/lib/logger";
import type { AiGeneratePayload } from "@/types/publishing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Create AI Video" — enqueues a one-off content run that produces and
 * publishes a video on demand, independent of the daily schedule. A unique
 * (timestamped) idempotency key ensures it never collapses into the day-scoped
 * scheduled run, and the worker drains it alongside the scheduled jobs.
 *
 * Accepts an optional JSON body of AI options. Publishing controls
 * (privacy / schedule / category / playlist) are threaded to the publish step;
 * the topic/script/metadata hints are persisted on the job so the pipeline can
 * consume them (custom topic/script generation is the documented follow-up —
 * the pipeline currently auto-discovers the topic).
 *
 * NOTE: this only ENQUEUES the job — a worker (ffmpeg/chromium host with the
 * model / R2 keys) must be running to actually render & upload it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<AiGeneratePayload>;
    const dayStamp = new Date().toISOString().slice(0, 10);
    const draft = body.draft === true;

    const publishOpts = {
      privacy: body.privacy ?? "public",
      publishAt: body.publishAt ?? null,
      categoryId: body.categoryId,
      playlistId: body.playlistId,
    };

    const jobId = await enqueue("content", {
      payload: {
        dayStamp,
        immediate: !body.publishAt, // scheduled runs keep their publish time
        draft,
        // Persisted hints + publishing controls consumed by the publish step.
        topic: body.topic ?? null,
        script: body.script ?? null,
        title: body.title ?? null,
        description: body.description ?? null,
        tags: body.tags ?? [],
        auto: {
          title: body.autoTitle ?? true,
          description: body.autoDescription ?? true,
          thumbnail: body.autoThumbnail ?? true,
        },
        publish: publishOpts,
      },
      idempotencyKey: `content:ondemand:${new Date().toISOString()}`,
      priority: 20,
      timeoutMs: 15 * 60_000,
    });
    await log.info("dashboard", `AI video enqueued (job ${jobId}${draft ? ", draft" : ""})`);
    return NextResponse.json({ ok: true, jobId });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown error";
    await log.error("dashboard", `AI video enqueue failed: ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
