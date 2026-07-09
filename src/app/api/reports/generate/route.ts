import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Generates a report. Body: { period?: "daily"|"weekly"|"monthly" }. */
export async function POST(req: NextRequest) {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let period: "daily" | "weekly" | "monthly" = "daily";
  try {
    const body = (await req.json()) as { period?: typeof period };
    if (body.period) period = body.period;
  } catch {
    /* default daily */
  }
  try {
    const { generateReport } = await import("@/services/analytics/report");
    const result = await generateReport(period);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
