import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 250;

/**
 * Publishes an already-rendered video to YouTube.
 * Body: { videoId: string, privacy?, publishAt?, playlistId? }.
 * Protected by WORKER_SHARED_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { videoId?: string; privacy?: "public" | "private" | "unlisted"; publishAt?: string; playlistId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* no body */
  }
  if (!body.videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  try {
    const { publishVideo } = await import("@/services/publish");
    const result = await publishVideo(body.videoId, {
      privacy: body.privacy,
      publishAt: body.publishAt,
      playlistId: body.playlistId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
