import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { QuotaError } from "@/services/youtube/api";

// YouTube Data API costs. videos.insert dominates the daily budget.
export const QUOTA_COST = { insert: 1600, thumbnail: 50, playlist: 50 } as const;

function limit(): number {
  return Number(process.env.YOUTUBE_DAILY_QUOTA ?? 10000);
}

/** UTC day key. YouTube quota actually resets at midnight Pacific; UTC is a
 *  safe approximation (never over-spends, may reset slightly late). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reserves `units` of today's quota, throwing QuotaError if it would exceed
 * the daily limit. Not strictly atomic — safe for the single-channel worker.
 */
export async function reserveQuota(units: number): Promise<void> {
  const date = today();
  const db = supabaseAdmin();
  const { data } = await db
    .from("api_quota")
    .select("units")
    .eq("date", date)
    .maybeSingle();
  const used = (data as { units: number } | null)?.units ?? 0;
  if (used + units > limit()) {
    throw new QuotaError(`daily quota would exceed: ${used}+${units}>${limit()}`);
  }
  await db
    .from("api_quota")
    .upsert({ date, units: used + units, updated_at: new Date().toISOString() });
}

export async function quotaUsedToday(): Promise<number> {
  const { data } = await supabaseAdmin()
    .from("api_quota")
    .select("units")
    .eq("date", today())
    .maybeSingle();
  return (data as { units: number } | null)?.units ?? 0;
}
