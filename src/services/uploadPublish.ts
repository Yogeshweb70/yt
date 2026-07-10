import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

export interface UploadedVideoInput {
  videoUrl: string; // R2 public URL of the uploaded MP4
  thumbnailUrl?: string | null; // R2 public URL of the thumbnail, if any
  durationSec?: number | null;
  title: string;
  description: string;
  tags: string[];
  language: string; // "en" | "hi" | ...
  categoryLabel?: string; // human category for the manifest topic
}

/**
 * Registers a user-uploaded, already-final video so the existing manifest-based
 * publish path (`publishVideo`) can push it to YouTube. Creates the minimal
 * `scripts` + `asset_manifests` + `videos` rows the publisher reads.
 *
 * `publishVideo`/`buildMetadata` only consume `seo.*`, `topic.title` and
 * `language` from the manifest, so we store exactly those (the rest of the
 * AssetManifest is irrelevant for an already-rendered upload).
 */
export async function createUploadedVideo(input: UploadedVideoInput): Promise<string> {
  const db = supabaseAdmin();

  const { data: script, error: scriptErr } = await db
    .from("scripts")
    .insert({
      language: input.language,
      body: "(user-uploaded video — no generated script)",
    })
    .select("id")
    .single();
  if (scriptErr) throw scriptErr;
  const scriptId = (script as { id: string }).id;

  const manifest = {
    topic: {
      id: scriptId,
      title: input.title,
      summary: input.description,
      category: input.categoryLabel ?? "Entertainment",
    },
    language: input.language,
    seo: {
      title: input.title,
      description: input.description,
      keywords: input.tags,
      hashtags: [],
      tags: input.tags,
    },
  };

  const { error: manifestErr } = await db.from("asset_manifests").insert({
    script_id: scriptId,
    language: input.language,
    manifest,
    status: "ready",
  });
  if (manifestErr) throw manifestErr;

  const { data: video, error: videoErr } = await db
    .from("videos")
    .insert({
      script_id: scriptId,
      url: input.videoUrl,
      thumbnail_url: input.thumbnailUrl ?? null,
      duration_sec: input.durationSec ?? null,
      status: "rendered",
    })
    .select("id")
    .single();
  if (videoErr) throw videoErr;
  const videoId = (video as { id: string }).id;

  await log.info("upload", `registered uploaded video ${videoId} (script ${scriptId})`);
  return videoId;
}
