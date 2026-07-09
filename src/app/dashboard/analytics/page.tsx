import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

interface Health {
  avgViews: number;
  avgCtr: number;
  avgRetention: number;
  avgEngagement: number;
  uploadConsistency: number;
  growthRate: number;
  trendingDirection: string;
  sampleSize: number;
}
interface Metric {
  video_id: string;
  title: string | null;
  views: number;
  ctr: number | null;
  avg_view_pct: number;
}
interface Rec {
  area: string;
  suggestion: string;
  priority: string;
}

export default async function AnalyticsDashboard() {
  const health = await safe(async () => {
    const { data } = await supabaseAdmin()
      .from("channel_health")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    return (data as Health[])?.[0] ?? null;
  }, null as Health | null);

  const metrics = await safe(async () => {
    const { data } = await supabaseAdmin()
      .from("video_metrics")
      .select("video_id, title, views, ctr, avg_view_pct")
      .order("views", { ascending: false })
      .limit(20);
    return (data as Metric[]) ?? [];
  }, [] as Metric[]);

  const recs = await safe(async () => {
    const { data } = await supabaseAdmin()
      .from("recommendations")
      .select("area, suggestion, priority")
      .order("created_at", { ascending: false })
      .limit(8);
    return (data as Rec[]) ?? [];
  }, [] as Rec[]);

  const top = metrics.slice(0, 5);
  const worst = [...metrics].slice(-5).reverse();

  const tiles: [string, string | number][] = health
    ? [
        ["Avg views", health.avgViews],
        ["Avg CTR %", health.avgCtr],
        ["Avg retention %", health.avgRetention],
        ["Avg engagement %", health.avgEngagement],
        ["Consistency", health.uploadConsistency],
        ["Growth %", health.growthRate],
        ["Trend", health.trendingDirection],
        ["Videos", health.sampleSize],
      ]
    : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">Channel Analytics</h1>

      {!health ? (
        <p className="text-sm text-muted">
          No analytics yet. Data appears after the sync worker runs
          (<code>POST /api/analytics/sync</code>).
        </p>
      ) : (
        <>
          <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map(([label, v]) => (
              <div key={label} className="rounded-xl border border-white/10 p-4 text-center">
                <div className="text-2xl font-bold">{v}</div>
                <div className="text-xs text-muted">{label}</div>
              </div>
            ))}
          </section>

          <div className="grid gap-8 md:grid-cols-2">
            <section>
              <h2 className="mb-3 text-lg font-semibold">Top videos</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {top.map((m) => (
                  <li key={m.video_id} className="flex justify-between border-b border-white/5 py-1">
                    <span className="truncate pr-2">{m.title ?? m.video_id}</span>
                    <span className="text-muted">{m.views}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-3 text-lg font-semibold">Needs attention</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {worst.map((m) => (
                  <li key={m.video_id} className="flex justify-between border-b border-white/5 py-1">
                    <span className="truncate pr-2">{m.title ?? m.video_id}</span>
                    <span className="text-muted">ret {m.avg_view_pct}%</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {recs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Recommendations</h2>
          <ul className="flex flex-col gap-2">
            {recs.map((r, i) => (
              <li key={i} className="rounded-lg border border-white/10 px-4 py-2 text-sm">
                <span className="mr-2 rounded bg-primary/20 px-2 py-0.5 text-xs uppercase text-primary">
                  {r.priority}
                </span>
                <span className="font-medium">{r.area}:</span> {r.suggestion}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
