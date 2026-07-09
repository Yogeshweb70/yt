import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Weekly learning + recommendations. Protected by WORKER_SHARED_SECRET (cron). */
export async function POST(req: NextRequest) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { runLearning, generateRecommendations } = await import(
      "@/services/analytics/insights"
    );
    await runLearning();
    const recs = await generateRecommendations();
    return NextResponse.json({ ok: true, recommendations: recs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
