import "server-only";
import os from "node:os";
import path from "node:path";
import { readFile, unlink } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureSceneImages, ensureThumbnailImage } from "@/services/images";
import { putObject } from "@/lib/storage";
import { runStage } from "@/services/jobs";
import { log } from "@/lib/logger";
import type { AssetManifest } from "@/types/pipeline";

const ENTRY = path.join(process.cwd(), "src", "remotion", "index.ts");

interface ManifestRow {
  script_id: string;
  manifest: AssetManifest;
}

async function loadManifest(manifestId: string): Promise<ManifestRow> {
  const { data, error } = await supabaseAdmin()
    .from("asset_manifests")
    .select("script_id, manifest")
    .eq("id", manifestId)
    .single();
  if (error) throw error;
  return data as ManifestRow;
}

export interface RenderResult {
  videoId: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationSec: number;
}

/**
 * Phase 3 render engine. Consumes an existing Asset Manifest (never
 * regenerates script/seo/captions/voice) and produces a 1080x1920 H264 MP4
 * plus a thumbnail, both uploaded to R2. Bundling happens once and is reused
 * for the video and the still. Wrapped in idempotent/resumable jobs.
 */
export async function renderManifest(manifestId: string): Promise<RenderResult> {
  const { script_id: scriptId, manifest } = await loadManifest(manifestId);

  // Stage 1 — assets (scene images + thumbnail image).
  const { sceneImages, thumbnailUrl: thumbImage } = await runStage(
    "images",
    `render-images:${manifestId}`,
    async () => ({
      sceneImages: await ensureSceneImages(scriptId, manifest),
      thumbnailUrl: await ensureThumbnailImage(scriptId, manifest),
    }),
  );

  // Stage 2 — bundle + render video + thumbnail + upload + persist.
  return runStage("render", `render:${manifestId}`, async () => {
    await log.info("render", `bundling for ${manifestId}`);
    const serveUrl = await bundle({ entryPoint: ENTRY });

    const inputProps = {
      manifest,
      sceneImages,
      musicUrl: process.env.MUSIC_URL ?? null,
      sfx: [],
    };

    const composition = await selectComposition({
      serveUrl,
      id: "Short",
      inputProps,
    });

    const videoPath = path.join(os.tmpdir(), `${manifestId}.mp4`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: videoPath,
      inputProps,
      videoBitrate: process.env.RENDER_VIDEO_BITRATE ?? "12M",
      audioBitrate: "192k",
      x264Preset: "medium",
      pixelFormat: "yuv420p",
    });

    const thumb = await selectComposition({
      serveUrl,
      id: "Thumbnail",
      inputProps: { imageUrl: thumbImage, title: manifest.seo.title || manifest.topic.title },
    });
    const thumbPath = path.join(os.tmpdir(), `${manifestId}.png`);
    await renderStill({
      composition: thumb,
      serveUrl,
      output: thumbPath,
      inputProps: { imageUrl: thumbImage, title: manifest.seo.title || manifest.topic.title },
    });

    const [videoBytes, thumbBytes] = await Promise.all([
      readFile(videoPath),
      readFile(thumbPath),
    ]);
    const videoUrl = await putObject(`videos/${manifestId}.mp4`, videoBytes, "video/mp4");
    const thumbnailUrl = await putObject(`thumbnails/${manifestId}.png`, thumbBytes, "image/png");
    await Promise.allSettled([unlink(videoPath), unlink(thumbPath)]);

    const durationSec = manifest.voice.duration_sec;
    const { data, error } = await supabaseAdmin()
      .from("videos")
      .insert({
        script_id: scriptId,
        url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration_sec: durationSec,
        status: "rendered",
      })
      .select("id")
      .single();
    if (error) throw error;

    const videoId = (data as { id: string }).id;
    await log.info("render", `rendered video ${videoId} for ${manifestId}`);
    return { videoId, videoUrl, thumbnailUrl, durationSec };
  });
}
