import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only live queue snapshot for the dashboard progress panel. Polled by the
 * client every few seconds. Uses a stable route (not a content-hashed Server
 * Action id), so it survives dev recompiles without "action not found" errors.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from("queue_jobs")
      .select("id, type, status, progress, attempts, error, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const jobs = (data ?? []).map((j: Record<string, unknown>) => ({
      id: String(j.id),
      type: String(j.type),
      status: String(j.status),
      progress: Number(j.progress ?? 0),
      attempts: Number(j.attempts ?? 0),
      error: (j.error as string | null) ?? null,
      updatedAt: String(j.updated_at),
    }));
    return NextResponse.json({ ok: true, jobs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, jobs: [], error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
