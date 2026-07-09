import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getConnection, getValidAccessToken } from "@/lib/youtube/connection";
import {
  uploadVideo,
  setThumbnail,
  addToPlaylist,
  QuotaError,
  NonRetryableError,
  type VideoMetadata,
} from "@/services/youtube/api";
import { reserveQuota, QUOTA_COST } from "@/services/quota";
import { runStage } from "@/services/jobs";
import { log } from "@/lib/logger";
import type { AssetManifest } from "@/types/pipeline";

export interface PublishOptions {
  privacy?: "public" | "private" | "unlisted";
  publishAt?: string | null;
  playlistId?: string | null;
}

interface VideoRow {
  id: string;
  script_id: string;
  url: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
}

async function loadVideo(videoId: string): Promise<{ video: VideoRow; manifest: AssetManifest }> {
  const { data: v, error } = await supabaseAdmin()
    .from("videos")
    .select("id, script_id, url, thumbnail_url, duration_sec")
    .eq("id", videoId)
    .single();
  if (error) throw error;
  const video = v as VideoRow;

  const { data: m } = await supabaseAdmin()
    .from("asset_manifests")
    .select("manifest")
    .eq("script_id", video.script_id)
    .limit(1)
    .maybeSingle();
  if (!m) throw new NonRetryableError(`no manifest for script ${video.script_id}`);
  return { video, manifest: (m as { manifest: AssetManifest }).manifest };
}

function buildMetadata(manifest: AssetManifest, opts: PublishOptions): VideoMetadata {
  const { seo } = manifest;
  const description = `${seo.description}\n\n${seo.hashtags.join(" ")}`.trim();
  // YouTube caps total tag length ~500 chars.
  const tags: string[] = [];
  let len = 0;
  for (const t of seo.tags) {
    if (len + t.length + 1 > 500) break;
    tags.push(t);
    len += t.length + 1;
  }
  return {
    title: seo.title || manifest.topic.title,
    description,
    tags,
    categoryId: process.env.YOUTUBE_CATEGORY_ID ?? "24",
    language: manifest.language,
    madeForKids: process.env.YOUTUBE_MADE_FOR_KIDS === "true",
    privacyStatus:
      opts.privacy ??
      ((process.env.YOUTUBE_PRIVACY as VideoMetadata["privacyStatus"]) ?? "public"),
    publishAt: opts.publishAt ?? process.env.YOUTUBE_PUBLISH_AT ?? null,
  };
}

async function setStatus(
  videoId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin()
    .from("uploads")
    .upsert({ video_id: videoId, ...fields }, { onConflict: "video_id" });
}

async function bumpRetry(videoId: string, status: string, error: string): Promise<void> {
  const { data } = await supabaseAdmin()
    .from("uploads")
    .select("retry_count")
    .eq("video_id", videoId)
    .maybeSingle();
  const retry = ((data as { retry_count: number } | null)?.retry_count ?? 0) + 1;
  await setStatus(videoId, { status, error, retry_count: retry });
}

/**
 * Publishing worker. Uploads a rendered video + thumbnail to YouTube, applies
 * SEO metadata, optionally schedules and adds to a playlist, and records
 * history. Idempotent (skips if already has a YouTube id) and resumable via
 * the jobs table. Classifies failures for correct retry behaviour.
 */
export async function publishVideo(
  videoId: string,
  opts: PublishOptions = {},
): Promise<{ youtubeId: string; publishedUrl: string }> {
  return runStage("publish", `publish:${videoId}`, async () => {
    // Idempotency guard: never double-upload to YouTube.
    const { data: existing } = await supabaseAdmin()
      .from("uploads")
      .select("youtube_id")
      .eq("video_id", videoId)
      .maybeSingle();
    const priorYt = (existing as { youtube_id: string | null } | null)?.youtube_id;
    if (priorYt) {
      return { youtubeId: priorYt, publishedUrl: `https://youtu.be/${priorYt}` };
    }

    const { video, manifest } = await loadVideo(videoId);
    const conn = await getConnection();
    const meta = buildMetadata(manifest, opts);
    const playlistId = opts.playlistId ?? process.env.YOUTUBE_PLAYLIST_ID ?? null;

    await setStatus(videoId, {
      status: "uploading",
      channel_id: conn?.channel_id ?? null,
      privacy: meta.privacyStatus,
      scheduled_at: meta.publishAt,
      playlist_id: playlistId,
      duration_sec: video.duration_sec,
      thumbnail_url: video.thumbnail_url,
      error: null,
    });

    try {
      const token = await getValidAccessToken();

      await reserveQuota(QUOTA_COST.insert);
      const youtubeId = await uploadVideo(token, video.url, meta);
      const publishedUrl = `https://youtu.be/${youtubeId}`;
      await setStatus(videoId, { status: "processing", youtube_id: youtubeId, published_url: publishedUrl });

      // Thumbnail — retry once (Step 5).
      if (video.thumbnail_url) {
        for (let a = 0; a < 2; a++) {
          try {
            await reserveQuota(QUOTA_COST.thumbnail);
            await setThumbnail(token, youtubeId, video.thumbnail_url);
            break;
          } catch {
            if (a === 1) await log.warn("publish", "thumbnail upload failed", { videoId });
            else await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      if (playlistId) {
        try {
          await reserveQuota(QUOTA_COST.playlist);
          await addToPlaylist(token, playlistId, youtubeId);
        } catch {
          await log.warn("publish", "playlist add failed", { videoId, playlistId });
        }
      }

      const published = !meta.publishAt && meta.privacyStatus === "public";
      await setStatus(videoId, {
        status: published ? "published" : "processing",
        published_at: published ? new Date().toISOString() : null,
      });
      await supabaseAdmin().from("videos").update({ status: "published" }).eq("id", videoId);

      await log.info("publish", `published ${youtubeId}`, { videoId });
      return { youtubeId, publishedUrl };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const retryable = !(e instanceof NonRetryableError);
      await bumpRetry(videoId, retryable ? "retrying" : "failed", message);
      if (e instanceof QuotaError) {
        await log.warn("publish", "quota exhausted, will retry next window", { videoId });
      }
      throw e; // re-thrown so the job records failure and a re-run resumes.
    }
  });
}
