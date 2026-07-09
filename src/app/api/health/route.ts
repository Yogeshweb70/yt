import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness probe for container health checks (no secrets exposed). */
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
