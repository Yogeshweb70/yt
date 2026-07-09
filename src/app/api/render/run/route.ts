import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 299;

/**
 * Renders a video from an existing Asset Manifest.
 * Body: { manifestId: string }. Protected by WORKER_SHARED_SECRET.
 * Must run on a container with ffmpeg + chromium (not Vercel serverless).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let manifestId: string | undefined;
  try {
    ({ manifestId } = (await req.json()) as { manifestId?: string });
  } catch {
    /* no body */
  }
  if (!manifestId) {
    return NextResponse.json({ error: "manifestId required" }, { status: 400 });
  }

  try {
    // Imported lazily so the heavy Remotion toolchain loads only when rendering.
    const { renderManifest } = await import("@/services/render");
    const result = await renderManifest(manifestId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
