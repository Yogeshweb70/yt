import { NextResponse, type NextRequest } from "next/server";
import { cancel, cancelAllActive } from "@/services/queue/queue";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cancels queue jobs from the dashboard progress panel.
 *  - `{ id }`   cancels a single active (pending/running) job.
 *  - `{ all: true }` cancels every active job ("Stop all").
 *
 * Best-effort for running jobs: the worker has no mid-handler interrupt, so a
 * job already executing finishes its current handler, but it is marked
 * cancelled (won't retry) and its still-pending dependents stay blocked.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
    const count = body.all ? await cancelAllActive() : body.id ? await cancel(body.id) : 0;
    if (!body.all && !body.id) {
      return NextResponse.json({ ok: false, error: "id or all required" }, { status: 400 });
    }
    await log.info("dashboard", `cancel ${body.all ? "all" : body.id} → ${count} job(s)`);
    return NextResponse.json({ ok: true, cancelled: count });
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
