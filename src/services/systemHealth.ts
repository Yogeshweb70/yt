import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { quotaUsedToday } from "@/services/quota";
import { costSummary } from "@/services/cost";

export interface HealthSnapshot {
  queue: { pending: number; running: number; dead: number; done: number };
  db: "ok" | "error";
  quotaUsedToday: number;
  costToday: number;
  oldestPendingAgeSec: number | null;
  at: string;
}

async function countBy(status: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from("queue_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

/** Step 5: system health snapshot, persisted for the dashboard + alerting. */
export async function snapshotHealth(): Promise<HealthSnapshot> {
  let db: "ok" | "error" = "ok";
  let pending = 0,
    running = 0,
    dead = 0,
    done = 0;
  try {
    [pending, running, dead, done] = await Promise.all([
      countBy("pending"),
      countBy("running"),
      countBy("dead"),
      countBy("done"),
    ]);
  } catch {
    db = "error";
  }

  let oldestPendingAgeSec: number | null = null;
  const { data: oldest } = await supabaseAdmin()
    .from("queue_jobs")
    .select("created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (oldest) {
    oldestPendingAgeSec = Math.round(
      (Date.now() - Date.parse((oldest as { created_at: string }).created_at)) / 1000,
    );
  }

  const cost = await costSummary(1).catch(() => ({ total: 0, byKind: {} }));
  const snapshot: HealthSnapshot = {
    queue: { pending, running, dead, done },
    db,
    quotaUsedToday: await quotaUsedToday().catch(() => 0),
    costToday: cost.total,
    oldestPendingAgeSec,
    at: new Date().toISOString(),
  };
  await supabaseAdmin().from("system_health").insert({ snapshot }).then(
    () => undefined,
    () => undefined,
  );
  return snapshot;
}
