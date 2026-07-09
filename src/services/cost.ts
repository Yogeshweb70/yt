import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export { RATES, estimateVideoCost, type CostCounts } from "@/services/costCalc";

export async function recordCost(
  kind: string,
  amount: number,
  opts: { videoId?: string; provider?: string; meta?: Record<string, unknown> } = {},
): Promise<void> {
  await supabaseAdmin().from("cost_entries").insert({
    kind,
    amount,
    video_id: opts.videoId ?? null,
    provider: opts.provider ?? null,
    meta: opts.meta ?? null,
  });
}

/** Total estimated cost recorded for one completed video (Step 4). */
export async function perVideoCost(videoId: string): Promise<number> {
  const { data } = await supabaseAdmin()
    .from("cost_entries")
    .select("amount")
    .eq("video_id", videoId);
  const rows = (data as { amount: number }[]) ?? [];
  return Math.round(rows.reduce((a, r) => a + Number(r.amount), 0) * 10000) / 10000;
}

/** Sums cost over a rolling window (days). */
export async function costSummary(days: number): Promise<{ total: number; byKind: Record<string, number> }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabaseAdmin()
    .from("cost_entries")
    .select("kind, amount")
    .gte("created_at", since);
  const rows = (data as { kind: string; amount: number }[]) ?? [];
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + Number(r.amount);
    total += Number(r.amount);
  }
  return { total: Math.round(total * 10000) / 10000, byKind };
}
