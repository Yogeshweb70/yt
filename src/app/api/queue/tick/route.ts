import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Drains ready jobs. Called repeatedly by a scheduler (cron / worker loop).
 * Body: { workerId?, max?, types?[] }. Protected by WORKER_SHARED_SECRET.
 * Deploy on the ffmpeg/chromium host so it can process render/autopilot jobs.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { workerId?: string; max?: number; types?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    /* defaults */
  }
  try {
    const { runTick } = await import("@/services/queue/worker");
    const result = await runTick(body.workerId ?? "cron", body.max ?? 5, body.types);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
