import "server-only";
import { enqueue } from "@/services/queue/queue";
import { runPipeline } from "@/services/pipeline";
import { runManifestToYouTube } from "@/services/autopilot";
import { syncAnalytics } from "@/services/analytics/sync";
import { runLearning, generateRecommendations } from "@/services/analytics/insights";
import { generateReport, type Period } from "@/services/analytics/report";
import { snapshotHealth } from "@/services/systemHealth";

/** Per-job context the worker passes to each handler. `reportProgress` writes
 *  the 0–100 % into `queue_jobs.progress` so the dashboard can render live steps. */
export interface JobContext {
  jobId: string;
  reportProgress: (pct: number, stage?: string) => Promise<void>;
}

type Handler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<unknown>;

/**
 * Daily publish slots (UTC). The N-th video of the day is scheduled at the
 * N-th slot; extra manifests beyond the list fall back to no schedule.
 */
const PUBLISH_SLOTS_UTC = ["00:00", "11:59", "21:00"];

/** ISO publish time for the given day + slot, rolled to the next day if it
 * has already passed (YouTube rejects scheduled times in the past). */
function slotPublishAt(dayStamp: string, slot: string): string {
  const at = new Date(`${dayStamp}T${slot}:00.000Z`);
  if (at.getTime() <= Date.now()) at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString();
}

/**
 * Logical worker registry (Step 2). One process can serve all types, or a
 * deployment can restrict `types` to act as a dedicated worker (e.g. only the
 * ffmpeg/chromium box claims "autopilot"). Each handler reuses the existing
 * phase services unchanged; chaining is done by enqueuing follow-up jobs so the
 * whole pipeline is durable and resumable.
 */
export const HANDLERS: Record<string, Handler> = {
  // Content: discover→rank→…→manifests, then fan out one autopilot job per manifest.
  content: async (p, ctx) => {
    const dayStamp = String(p.dayStamp ?? new Date().toISOString().slice(0, 10));
    // On-demand ("publish now") runs skip slot scheduling and publish immediately.
    const immediate = p.immediate === true;
    // Publishing controls forwarded from the "Create AI Video" form (privacy,
    // schedule, category, playlist). Undefined for scheduled pipeline runs.
    const publish = (p.publish as Record<string, unknown> | undefined) ?? {};
    await ctx.reportProgress(5, "Topic");
    const result = await runPipeline(dayStamp, (pct, stage) =>
      ctx.reportProgress(pct, stage),
    );
    await ctx.reportProgress(100, "Done");
    // Assign each of the day's videos to a distinct publish slot (UTC).
    for (const [i, m] of result.manifests.entries()) {
      const slot = PUBLISH_SLOTS_UTC[i];
      // Explicit user schedule (publish.publishAt) wins over slot assignment.
      const publishAt =
        (publish.publishAt as string | null | undefined) ??
        (immediate ? null : slot ? slotPublishAt(dayStamp, slot) : null);
      await enqueue("autopilot", {
        payload: {
          manifestId: m.manifestId,
          publishAt,
          privacy: publish.privacy,
          categoryId: publish.categoryId,
          playlistId: publish.playlistId,
        },
        idempotencyKey: `autopilot:${m.manifestId}`,
        priority: 5,
      });
    }
     return result;
  },

  // Render → optimize → publish (heavy: run on the ffmpeg/chromium worker).
  autopilot: (p, ctx) =>
    runManifestToYouTube(
      String(p.manifestId),
      {
        publishAt: (p.publishAt as string | null) ?? undefined,
        privacy: p.privacy as "public" | "private" | "unlisted" | undefined,
        categoryId: p.categoryId as string | undefined,
        playlistId: p.playlistId as string | undefined,
      },
      { onStage: (_stage, pct) => ctx.reportProgress(pct) },
    ),

  // Publish an already-final, user-uploaded video (Cards 2 & 3). Reuses the
  // manifest-based publish path via a minimal manifest created at upload time.
  publish: (p) =>
    import("@/services/publish").then(({ publishVideo }) =>
      publishVideo(String(p.videoId), {
        privacy: p.privacy as "public" | "private" | "unlisted" | undefined,
        publishAt: (p.publishAt as string | null) ?? undefined,
        categoryId: p.categoryId as string | undefined,
        playlistId: p.playlistId as string | undefined,
      }),
    ),

  analytics: () => syncAnalytics(),

  learn: async () => {
    await runLearning();
    return { recommendations: await generateRecommendations() };
  },

  report: (p) => generateReport((p.period as Period) ?? "daily"),

  health: () => snapshotHealth(),
};

export type JobHandlerType = keyof typeof HANDLERS;
