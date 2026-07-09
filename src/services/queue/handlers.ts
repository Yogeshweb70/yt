import "server-only";
import { enqueue } from "@/services/queue/queue";
import { runPipeline } from "@/services/pipeline";
import { runManifestToYouTube } from "@/services/autopilot";
import { syncAnalytics } from "@/services/analytics/sync";
import { runLearning, generateRecommendations } from "@/services/analytics/insights";
import { generateReport, type Period } from "@/services/analytics/report";
import { snapshotHealth } from "@/services/systemHealth";

type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

/**
 * Daily publish slots (UTC). The N-th video of the day is scheduled at the
 * N-th slot; extra manifests beyond the list fall back to no schedule.
 */
const PUBLISH_SLOTS_UTC = ["00:00", "11:59", "20:00"];

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
  content: async (p) => {
    const dayStamp = String(p.dayStamp ?? new Date().toISOString().slice(0, 10));
    const result = await runPipeline(dayStamp);
    // Assign each of the day's videos to a distinct publish slot (UTC).
    for (const [i, m] of result.manifests.entries()) {
      const slot = PUBLISH_SLOTS_UTC[i];
      const publishAt = slot ? slotPublishAt(dayStamp, slot) : null;
      await enqueue("autopilot", {
        payload: { manifestId: m.manifestId, publishAt },
        idempotencyKey: `autopilot:${m.manifestId}`,
        priority: 5,
      });
    }
    return result;
  },

  // Render → optimize → publish (heavy: run on the ffmpeg/chromium worker).
  autopilot: (p) =>
    runManifestToYouTube(String(p.manifestId), {
      publishAt: (p.publishAt as string | null) ?? undefined,
    }),

  analytics: () => syncAnalytics(),

  learn: async () => {
    await runLearning();
    return { recommendations: await generateRecommendations() };
  },

  report: (p) => generateReport((p.period as Period) ?? "daily"),

  health: () => snapshotHealth(),
};

export type JobHandlerType = keyof typeof HANDLERS;
