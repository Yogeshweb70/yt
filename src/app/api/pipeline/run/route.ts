import { NextResponse, type NextRequest } from "next/server";
import { runPipeline } from "@/services/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 299;

/**
 * Triggers the Phase 2 content pipeline. Protected by WORKER_SHARED_SECRET
 * (sent as `x-worker-secret`). Intended to be called by a cron/worker.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dayStamp = new Date().toISOString().slice(0, 10);
  try {
    const result = await runPipeline(dayStamp);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
