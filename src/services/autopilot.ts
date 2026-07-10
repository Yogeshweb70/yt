import "server-only";
import { renderManifest } from "@/services/render";
import { optimizeVideo } from "@/services/optimize";
import { publishVideo, type PublishOptions } from "@/services/publish";
import { log } from "@/lib/logger";

/** Named pipeline stages, in order, with the cumulative % complete after each. */
export type AutopilotStage = "render" | "optimize" | "publish" | "done";

export interface AutopilotHooks {
  /** Called as each stage completes, so callers (the worker) can surface live progress. */
  onStage?: (stage: AutopilotStage, pct: number) => void | Promise<void>;
}

/**
 * End-to-end autopilot for one manifest: render → publish. Both stages are
 * individually idempotent/resumable (jobs keyed by manifestId / videoId), so
 * re-invoking after a failure resumes rather than redoing completed work.
 */
export async function runManifestToYouTube(
  manifestId: string,
  opts: PublishOptions = {},
  hooks: AutopilotHooks = {},
): Promise<{ videoId: string; youtubeId: string; publishedUrl: string }> {
  const stage = async (s: AutopilotStage, pct: number) => {
    await hooks.onStage?.(s, pct);
  };
  await log.info("autopilot", `start ${manifestId}`);
  await stage("render", 10);
  const render = await renderManifest(manifestId);
  await stage("optimize", 45);
  // Phase 5: optimize creative + apply winners before upload.
  const opt = await optimizeVideo(render.videoId);
  await log.info("autopilot", `optimized ${render.videoId}`, {
    viral: opt.viralScore,
    cycles: opt.cycles,
  });
  await stage("publish", 75);
  const publish = await publishVideo(render.videoId, opts);
  await log.info("autopilot", `done ${manifestId}`, { youtubeId: publish.youtubeId });
  await stage("done", 100);
  return { videoId: render.videoId, ...publish };
}
