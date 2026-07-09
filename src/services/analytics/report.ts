import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import { runStage } from "@/services/jobs";
import { log } from "@/lib/logger";
import { ReportSummarySchema } from "@/types/analytics";

export type Period = "daily" | "weekly" | "monthly";
const WINDOW_DAYS: Record<Period, number> = { daily: 1, weekly: 7, monthly: 30 };

interface Row {
  video_id: string;
  title: string | null;
  views: number;
  ctr: number | null;
  avg_view_pct: number;
  engagement_rate: number;
}

/**
 * Step 12: generate a period report (top/worst videos + AI summary). One
 * idempotent job per (period, day).
 */
export async function generateReport(period: Period): Promise<{ reportId: string }> {
  const day = new Date().toISOString().slice(0, 10);
  return runStage("report", `report:${period}:${day}`, async () => {
    const since = new Date(Date.now() - WINDOW_DAYS[period] * 86_400_000).toISOString();
    const { data } = await supabaseAdmin()
      .from("video_metrics")
      .select("video_id, title, views, ctr, avg_view_pct, engagement_rate")
      .gte("updated_at", since)
      .order("views", { ascending: false });
    const rows = (data as Row[]) ?? [];

    const top = rows.slice(0, 5);
    const worst = rows.slice(-5).reverse();
    const totals = rows.reduce(
      (a, r) => ({ views: a.views + r.views, n: a.n + 1 }),
      { views: 0, n: 0 },
    );

    let summary: unknown = { headline: "No data in window", wins: [], issues: [], actions: [] };
    if (rows.length > 0) {
      summary = await chatJSON(
        {
          system:
            "You are a channel analyst writing a concise performance report. Return JSON.",
          user: `Period: ${period}. Videos: ${totals.n}, total views: ${totals.views}.\nTop: ${top
            .map((r) => `${r.title}(${r.views})`)
            .join("; ")}\nWorst: ${worst.map((r) => `${r.title}(${r.views})`).join("; ")}\n\nJSON: { "headline": "", "wins": [], "issues": [], "actions": [] }`,
        },
        ReportSummarySchema,
      );
    }

    const { data: inserted, error } = await supabaseAdmin()
      .from("reports")
      .insert({
        period,
        date: day,
        totals,
        top_videos: top,
        worst_videos: worst,
        summary,
      })
      .select("id")
      .single();
    if (error) throw error;

    await log.info("report", `${period} report generated`, { videos: rows.length });
    return { reportId: (inserted as { id: string }).id };
  });
}
