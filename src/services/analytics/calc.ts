import type {
  ChannelHealth,
  MetricPoint,
  Prediction,
  VideoMetrics,
} from "../../types/analytics";

// Pure analytics calculations. NO side effects / imports — unit-tested in calc.test.ts.

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const finite = (xs: (number | null | undefined)[]): number[] =>
  xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));

export function engagementRate(m: {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}): number {
  if (m.views <= 0) return 0;
  return ((m.likes + m.comments + m.shares) / m.views) * 100;
}

export function completionRate(m: {
  averageViewPercentage: number;
}): number {
  return Math.max(0, Math.min(100, m.averageViewPercentage));
}

/** % change of recent-half avg views vs older-half. 0 if not enough history. */
export function growthRate(points: MetricPoint[]): number {
  if (points.length < 2) return 0;
  const sorted = [...points].sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
  );
  const mid = Math.floor(sorted.length / 2);
  const older = mean(sorted.slice(0, mid).map((p) => p.views));
  const recent = mean(sorted.slice(mid).map((p) => p.views));
  if (older <= 0) return recent > 0 ? 100 : 0;
  return ((recent - older) / older) * 100;
}

export function trendingDirection(growth: number): ChannelHealth["trendingDirection"] {
  if (growth > 10) return "up";
  if (growth < -10) return "down";
  return "flat";
}

/** 0-100. 100 = perfectly even spacing between uploads. */
export function uploadConsistency(points: MetricPoint[]): number {
  if (points.length < 3) return points.length === 0 ? 0 : 50;
  const days = [...points]
    .map((p) => Date.parse(p.publishedAt))
    .sort((a, b) => a - b)
    .map((t) => t / 86_400_000);
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1]);
  const m = mean(gaps);
  if (m <= 0) return 100;
  const variance = mean(gaps.map((g) => (g - m) ** 2));
  const cv = Math.sqrt(variance) / m; // coefficient of variation
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}

export function channelHealth(points: MetricPoint[]): ChannelHealth {
  const growth = growthRate(points);
  return {
    avgViews: Math.round(mean(points.map((p) => p.views))),
    avgCtr: Math.round(mean(finite(points.map((p) => p.ctr))) * 100) / 100,
    avgRetention: Math.round(mean(points.map((p) => p.averageViewPercentage)) * 100) / 100,
    avgEngagement:
      Math.round(mean(points.map((p) => engagementRate(p))) * 100) / 100,
    uploadConsistency: uploadConsistency(points),
    growthRate: Math.round(growth * 100) / 100,
    trendingDirection: trendingDirection(growth),
    sampleSize: points.length,
  };
}

/** Data-driven baseline prediction from history. Confidence scales with sample. */
export function predictFromHistory(points: MetricPoint[]): Prediction {
  return {
    ctr: Math.round(mean(finite(points.map((p) => p.ctr))) * 100) / 100,
    watchTime: Math.round(mean(points.map((p) => p.averageViewDuration))),
    completionRate:
      Math.round(mean(points.map((p) => p.averageViewPercentage)) * 100) / 100,
    subGain: Math.round(mean(points.map((p) => p.subscribersGained))),
    engagementRate:
      Math.round(mean(points.map((p) => engagementRate(p))) * 100) / 100,
    confidence: Math.min(1, points.length / 10),
  };
}

/** Audience drop-off between consecutive retention samples (0-1 ratios).
 *  Returns the index of the largest drop and the per-step deltas. */
export function retentionDropoff(ratios: number[]): {
  worstIndex: number;
  deltas: number[];
} {
  const deltas: number[] = [];
  let worstIndex = 0;
  let worst = 0;
  for (let i = 1; i < ratios.length; i++) {
    const d = ratios[i - 1] - ratios[i];
    deltas.push(d);
    if (d > worst) {
      worst = d;
      worstIndex = i;
    }
  }
  return { worstIndex, deltas };
}

/** Flattens a full VideoMetrics into a MetricPoint for the calc layer. */
export function toPoint(m: VideoMetrics, publishedAt: string): MetricPoint {
  return {
    views: m.views,
    ctr: m.ctr,
    averageViewPercentage: m.averageViewPercentage,
    averageViewDuration: m.averageViewDuration,
    subscribersGained: m.subscribersGained,
    likes: m.likes,
    comments: m.comments,
    shares: m.shares,
    publishedAt,
  };
}
