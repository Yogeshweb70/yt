import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import { log } from "@/lib/logger";
import { notify } from "@/services/analytics/notify";
import { predictFromHistory } from "@/services/analytics/calc";
import { RecommendationsSchema } from "@/types/analytics";
import type { MetricPoint } from "@/types/analytics";

interface MetricRow {
  video_id: string;
  title: string | null;
  category: string | null;
  language: string | null;
  published_at: string | null;
  views: number;
  ctr: number | null;
  avg_view_pct: number;
  avg_view_duration: number;
  subscribers_gained: number;
  likes: number;
  comments: number;
  shares: number;
}

async function loadMetricRows(): Promise<MetricRow[]> {
  const { data } = await supabaseAdmin()
    .from("video_metrics")
    .select("*")
    .order("views", { ascending: false })
    .limit(200);
  return (data as MetricRow[]) ?? [];
}

const toPoint = (r: MetricRow): MetricPoint => ({
  views: r.views,
  ctr: r.ctr,
  averageViewPercentage: r.avg_view_pct,
  averageViewDuration: r.avg_view_duration,
  subscribersGained: r.subscribers_gained,
  likes: r.likes,
  comments: r.comments,
  shares: r.shares,
  publishedAt: r.published_at ?? "2026-01-01T00:00:00Z",
});

/** Step 7: AI recommendations from aggregate performance. */
export async function generateRecommendations(): Promise<number> {
  const rows = await loadMetricRows();
  if (rows.length === 0) return 0;
  const top = rows.slice(0, 5);
  const worst = rows.slice(-5);
  const summary = [
    `Videos: ${rows.length}`,
    `Top: ${top.map((r) => `${r.title}(v=${r.views},ctr=${r.ctr},ret=${r.avg_view_pct})`).join("; ")}`,
    `Worst: ${worst.map((r) => `${r.title}(v=${r.views},ret=${r.avg_view_pct})`).join("; ")}`,
  ].join("\n");

  const rec = await chatJSON(
    {
      system:
        "You are a YouTube growth strategist. From the performance summary, produce concrete, prioritized improvements for hooks, titles, descriptions, thumbnails, scripts, voice, animations, scene timing, posting time, and SEO. Return JSON.",
      user: `${summary}\n\nJSON: { "items": [{area, suggestion, priority}] }`,
    },
    RecommendationsSchema,
  );

  await supabaseAdmin().from("recommendations").insert(
    rec.items.map((i) => ({ area: i.area, suggestion: i.suggestion, priority: i.priority })),
  );
  await notify("recommendation", `${rec.items.length} new recommendations`);
  return rec.items.length;
}

/**
 * Step 8: Learning engine. Derives topic/keyword/hashtag rankings and
 * publishing intelligence from analytics, storing versioned `learning_models`
 * rows. Does NOT overwrite any file-based/manual prompts — downstream stages
 * may opt in to read the latest model.
 */
export async function runLearning(): Promise<void> {
  const rows = await loadMetricRows();
  if (rows.length === 0) return;

  const byKey = (key: keyof MetricRow) => {
    const agg = new Map<string, { views: number; n: number }>();
    for (const r of rows) {
      const k = String(r[key] ?? "unknown");
      const cur = agg.get(k) ?? { views: 0, n: 0 };
      cur.views += r.views;
      cur.n += 1;
      agg.set(k, cur);
    }
    return [...agg.entries()]
      .map(([k, v]) => ({ key: k, avgViews: Math.round(v.views / v.n), count: v.n }))
      .sort((a, b) => b.avgViews - a.avgViews);
  };

  // Publishing intelligence: best weekday / hour / language / duration bucket.
  const byHour = new Array(24).fill(0).map(() => ({ views: 0, n: 0 }));
  const byDay = new Array(7).fill(0).map(() => ({ views: 0, n: 0 }));
  for (const r of rows) {
    if (!r.published_at) continue;
    const d = new Date(r.published_at);
    byHour[d.getUTCHours()].views += r.views;
    byHour[d.getUTCHours()].n += 1;
    byDay[d.getUTCDay()].views += r.views;
    byDay[d.getUTCDay()].n += 1;
  }
  const bestOf = (arr: { views: number; n: number }[]) =>
    arr
      .map((x, i) => ({ i, avg: x.n ? x.views / x.n : 0 }))
      .sort((a, b) => b.avg - a.avg)[0]?.i ?? 0;

  const model = {
    topCategories: byKey("category").slice(0, 10),
    topLanguages: byKey("language"),
    publishing: {
      bestHourUTC: bestOf(byHour),
      bestWeekday: bestOf(byDay),
    },
    prediction: predictFromHistory(rows.map(toPoint)),
    generatedFrom: rows.length,
  };

  await supabaseAdmin().from("learning_models").insert({ kind: "channel", data: model });
  await log.info("learning", "learning model updated", { videos: rows.length });
}

/** Step 9: persist a fresh performance prediction baseline. */
export async function updatePrediction(): Promise<void> {
  const rows = await loadMetricRows();
  if (rows.length === 0) return;
  const p = predictFromHistory(rows.map(toPoint));
  await supabaseAdmin().from("performance_predictions").insert({ prediction: p, confidence: p.confidence });
}
