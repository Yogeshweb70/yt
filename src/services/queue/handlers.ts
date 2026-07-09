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
    for (const m of result.manifests) {
      await enqueue("autopilot", {
        payload: { manifestId: m.manifestId },
        idempotencyKey: `autopilot:${m.manifestId}`,
        priority: 5,
      });
    }
    return result;
  },

  // Render → optimize → publish (heavy: run on the ffmpeg/chromium worker).
  autopilot: (p) => runManifestToYouTube(String(p.manifestId)),

  analytics: () => syncAnalytics(),

  learn: async () => {
    await runLearning();
    return { recommendations: await generateRecommendations() };
  },

  report: (p) => generateReport((p.period as Period) ?? "daily"),

  health: () => snapshotHealth(),
};

export type JobHandlerType = keyof typeof HANDLERS;
