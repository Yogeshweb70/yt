import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/youtube/connection";
import { reserveQuota, quotaUsedToday } from "@/services/quota";
import { fetchVideoMetrics, fetchRetention } from "@/services/youtube/analytics";
import { channelHealth, retentionDropoff } from "@/services/analytics/calc";
import { updatePrediction } from "@/services/analytics/insights";
import { notify } from "@/services/analytics/notify";
import { runStage } from "@/services/jobs";
import { log } from "@/lib/logger";
import type { MetricPoint, VideoMetrics } from "@/types/analytics";

const CTR_DROP = Number(process.env.NOTIFY_CTR_DROP ?? 2); // %-points
const RET_DROP = Number(process.env.NOTIFY_RETENTION_DROP ?? 10);
const QUOTA_LOW = Number(process.env.NOTIFY_QUOTA_LOW ?? 8000);

interface UploadRow {
  video_id: string;
  youtube_id: string;
  published_at: string | null;
  channel_id: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

async function priorMetrics(videoId: string): Promise<VideoMetrics | null> {
  const { data } = await supabaseAdmin()
    .from("video_metrics")
    .select("ctr, avg_view_pct")
    .eq("video_id", videoId)
    .maybeSingle();
  if (!data) return null;
  return { ctr: (data as { ctr: number | null }).ctr, averageViewPercentage: (data as { avg_view_pct: number }).avg_view_pct } as VideoMetrics;
}

async function syncOne(token: string, u: UploadRow): Promise<MetricPoint | null> {
  const date = today();

  // Cache guard: one sync per video per UTC day (Step 16 — avoid dup API calls).
  const { data: cached } = await supabaseAdmin()
    .from("analytics_snapshots")
    .select("id")
    .eq("video_id", u.video_id)
    .eq("date", date)
    .maybeSingle();

  let metrics: VideoMetrics;
  if (cached) {
    const { data } = await supabaseAdmin()
      .from("analytics_snapshots")
      .select("metrics")
      .eq("id", (cached as { id: string }).id)
      .single();
    metrics = (data as { metrics: VideoMetrics }).metrics;
  } else {
    await reserveQuota(1); // Data API statistics
    metrics = await fetchVideoMetrics(token, u.youtube_id, daysAgo(90), date);
    const prev = await priorMetrics(u.video_id);

    // Append-only history (Step 2).
    await supabaseAdmin().from("analytics_snapshots").insert({
      video_id: u.video_id,
      youtube_id: u.youtube_id,
      date,
      metrics,
    });

    // Threshold notifications (Step 13).
    if (prev?.ctr != null && metrics.ctr != null && prev.ctr - metrics.ctr >= CTR_DROP) {
      await notify("ctr_drop", `CTR dropped on ${u.youtube_id}`, { from: prev.ctr, to: metrics.ctr });
    }
    if (prev && prev.averageViewPercentage - metrics.averageViewPercentage >= RET_DROP) {
      await notify("retention_drop", `Retention dropped on ${u.youtube_id}`);
    }
  }

  // Latest snapshot for fast querying (Step 6 dashboards).
  await upsertLatest(u, metrics);

  // Retention → scene mapping (Step 3), best-effort.
  await syncRetention(token, u, date).catch(() => undefined);

  return {
    views: metrics.views,
    ctr: metrics.ctr,
    averageViewPercentage: metrics.averageViewPercentage,
    averageViewDuration: metrics.averageViewDuration,
    subscribersGained: metrics.subscribersGained,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    publishedAt: u.published_at ?? `${date}T00:00:00Z`,
  };
}

async function upsertLatest(u: UploadRow, m: VideoMetrics): Promise<void> {
  const { data: meta } = await supabaseAdmin()
    .from("videos")
    .select("script_id")
    .eq("id", u.video_id)
    .maybeSingle();
  const scriptId = (meta as { script_id: string } | null)?.script_id;
  let title: string | null = null;
  let category: string | null = null;
  let language: string | null = null;
  if (scriptId) {
    const { data: man } = await supabaseAdmin()
      .from("asset_manifests")
      .select("manifest, language")
      .eq("script_id", scriptId)
      .limit(1)
      .maybeSingle();
    const manifest = (man as { manifest?: { seo?: { title?: string }; topic?: { category?: string } }; language?: string } | null);
    title = manifest?.manifest?.seo?.title ?? null;
    category = manifest?.manifest?.topic?.category ?? null;
    language = manifest?.language ?? null;
  }
  const engagement = m.views > 0 ? ((m.likes + m.comments + m.shares) / m.views) * 100 : 0;

  await supabaseAdmin().from("video_metrics").upsert(
    {
      video_id: u.video_id,
      youtube_id: u.youtube_id,
      title,
      category,
      language,
      published_at: u.published_at,
      views: m.views,
      ctr: m.ctr,
      impressions: m.impressions,
      avg_view_pct: m.averageViewPercentage,
      avg_view_duration: m.averageViewDuration,
      watch_minutes: m.estimatedMinutesWatched,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
      subscribers_gained: m.subscribersGained,
      engagement_rate: Math.round(engagement * 100) / 100,
      traffic_sources: m.trafficSources,
      search_terms: m.searchTerms,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "video_id" },
  );
}

async function syncRetention(token: string, u: UploadRow, date: string): Promise<void> {
  const ratios = await fetchRetention(token, u.youtube_id, daysAgo(90), date);
  if (ratios.length < 2) return;
  const { worstIndex, deltas } = retentionDropoff(ratios);
  const completion = ratios[ratios.length - 1] * 100;
  await supabaseAdmin().from("retention_reports").insert({
    video_id: u.video_id,
    ratios,
    worst_index: worstIndex,
    deltas,
    completion_rate: Math.round(completion * 100) / 100,
    date,
  });
}

/**
 * Daily analytics sync worker (Steps 1-3, 6, 9-10, 13, 16). Idempotent
 * (per-day cache), resumable via jobs, degrades gracefully per video.
 */
export async function syncAnalytics(): Promise<{ synced: number; health: unknown }> {
  return runStage("analytics_sync", `analytics_sync:${today()}`, async () => {
    const started = Date.now();
    const token = await getValidAccessToken();

    const { data } = await supabaseAdmin()
      .from("uploads")
      .select("video_id, youtube_id, published_at, channel_id")
      .not("youtube_id", "is", null)
      .in("status", ["published", "processing"]);
    const uploads = (data as UploadRow[]) ?? [];

    const points: MetricPoint[] = [];
    for (const u of uploads) {
      try {
        const p = await syncOne(token, u);
        if (p) points.push(p);
      } catch (e) {
        await log.warn("analytics", `sync failed for ${u.youtube_id}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Channel health (Step 10) + prediction (Step 9).
    const health = channelHealth(points);
    await supabaseAdmin().from("channel_health").insert({ ...health, date: today() });
    await updatePrediction();

    // Top performer + quota-low notifications.
    if (points.length) {
      const top = [...points].sort((a, b) => b.views - a.views)[0];
      if (top.views > health.avgViews * 2) {
        await notify("top_performer", `Top performer with ${top.views} views`);
      }
    }
    if ((await quotaUsedToday()) >= QUOTA_LOW) {
      await notify("quota_low", "Daily API quota running low");
    }

    await log.info("analytics", `synced ${points.length} videos`, {
      ms: Date.now() - started,
    });
    return { synced: points.length, health };
  });
}
