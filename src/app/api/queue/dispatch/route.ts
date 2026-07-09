import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enqueues the daily pipeline DAG. Protected by WORKER_SHARED_SECRET (cron). */
export async function POST(req: NextRequest) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { dispatchDailyRun } = await import("@/services/pipelineManager");
    const result = await dispatchDailyRun();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
