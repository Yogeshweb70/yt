import "server-only";
import { renderManifest } from "@/services/render";
import { optimizeVideo } from "@/services/optimize";
import { publishVideo, type PublishOptions } from "@/services/publish";
import { log } from "@/lib/logger";

/**
 * End-to-end autopilot for one manifest: render → publish. Both stages are
 * individually idempotent/resumable (jobs keyed by manifestId / videoId), so
 * re-invoking after a failure resumes rather than redoing completed work.
 */
export async function runManifestToYouTube(
  manifestId: string,
  opts: PublishOptions = {},
): Promise<{ videoId: string; youtubeId: string; publishedUrl: string }> {
  await log.info("autopilot", `start ${manifestId}`);
  const render = await renderManifest(manifestId);
  // Phase 5: optimize creative + apply winners before upload.
  const opt = await optimizeVideo(render.videoId);
  await log.info("autopilot", `optimized ${render.videoId}`, {
    viral: opt.viralScore,
    cycles: opt.cycles,
  });
  const publish = await publishVideo(render.videoId, opts);
  await log.info("autopilot", `done ${manifestId}`, { youtubeId: publish.youtubeId });
  return { videoId: render.videoId, ...publish };
}
