import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { putObject } from "@/lib/storage";
import { createUploadedVideo } from "@/services/uploadPublish";
import { enqueue } from "@/services/queue/queue";
import { log } from "@/lib/logger";
import { CATEGORIES, type Privacy } from "@/types/publishing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Size-capped path: the file is buffered server-side, so keep a generous but
// bounded window. Large files should move to presigned direct-to-R2 uploads.
export const maxDuration = 60;

/** Max accepted upload sizes (MB). Enforced client- and server-side. */
const MAX_VIDEO_MB = 50;
const MAX_THUMB_MB = 5;

/**
 * Upload an already-finished video + optional thumbnail and metadata, store the
 * assets in R2, register them, and enqueue a publish job. Used by both the
 * "Upload Existing Video" and "Manual Publish" cards.
 *
 * Body: multipart/form-data with `video` (File, required), `thumbnail` (File,
 * optional) and text fields: title, description, tags(JSON), category,
 * playlist, language, privacy, publishAt, draft.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const video = form.get("video");
    if (!(video instanceof File) || video.size === 0) {
      return NextResponse.json({ ok: false, error: "video file is required" }, { status: 400 });
    }
    if (video.size > MAX_VIDEO_MB * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: `video exceeds ${MAX_VIDEO_MB} MB limit` },
        { status: 413 },
      );
    }

    const title = String(form.get("title") ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    }
    const description = String(form.get("description") ?? "").trim();
    const language = String(form.get("language") ?? "en");
    const categoryId = String(form.get("category") ?? "24");
    const playlistId = (form.get("playlist") as string | null) || undefined;
    const privacy = (String(form.get("privacy") ?? "public") as Privacy);
    const publishAt = (form.get("publishAt") as string | null) || null;
    const draft = form.get("draft") === "true";
    let tags: string[] = [];
    try {
      tags = JSON.parse(String(form.get("tags") ?? "[]")) as string[];
    } catch {
      /* leave empty */
    }

    // Store the video in R2.
    const id = randomUUID();
    const videoBytes = Buffer.from(await video.arrayBuffer());
    const ext = video.name.split(".").pop()?.toLowerCase() || "mp4";
    const videoUrl = await putObject(
      `uploads/${id}.${ext}`,
      videoBytes,
      video.type || "video/mp4",
    );

    // Optional thumbnail.
    let thumbnailUrl: string | null = null;
    const thumb = form.get("thumbnail");
    if (thumb instanceof File && thumb.size > 0) {
      if (thumb.size > MAX_THUMB_MB * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: `thumbnail exceeds ${MAX_THUMB_MB} MB limit` },
          { status: 413 },
        );
      }
      const tExt = thumb.name.split(".").pop()?.toLowerCase() || "jpg";
      thumbnailUrl = await putObject(
        `uploads/${id}-thumb.${tExt}`,
        Buffer.from(await thumb.arrayBuffer()),
        thumb.type || "image/jpeg",
      );
    }

    const videoId = await createUploadedVideo({
      videoUrl,
      thumbnailUrl,
      title,
      description,
      tags,
      language,
      categoryLabel: CATEGORIES.find((c) => c.value === categoryId)?.label,
    });

    // Drafts are stored but not published; the operator can publish later.
    if (draft) {
      await log.info("upload", `saved draft video ${videoId}`);
      return NextResponse.json({ ok: true, videoId, draft: true });
    }

    const jobId = await enqueue("publish", {
      payload: { videoId, privacy, publishAt, categoryId, playlistId },
      idempotencyKey: `publish:upload:${videoId}`,
      priority: 20,
      timeoutMs: 10 * 60_000,
    });
    await log.info("upload", `uploaded video ${videoId} queued to publish (job ${jobId})`);
    return NextResponse.json({ ok: true, videoId, jobId });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown error";
    await log.error("upload", `upload failed: ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
