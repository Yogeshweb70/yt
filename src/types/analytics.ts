import { z } from "zod";

/** Flattened per-video metrics (union of Data API + Analytics API). */
export interface VideoMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number; // seconds
  averageViewPercentage: number; // 0-100
  impressions: number | null;
  ctr: number | null; // impression CTR %, 0-100
  uniqueViewers: number | null;
  trafficSources: Record<string, number>;
  searchTerms: { term: string; views: number }[];
}

/** Minimal point used by the pure calculation layer. */
export interface MetricPoint {
  views: number;
  ctr: number | null;
  averageViewPercentage: number;
  averageViewDuration: number;
  subscribersGained: number;
  likes: number;
  comments: number;
  shares: number;
  publishedAt: string; // ISO
}

export interface ChannelHealth {
  avgViews: number;
  avgCtr: number;
  avgRetention: number;
  avgEngagement: number;
  uploadConsistency: number; // 0-100
  growthRate: number; // %
  trendingDirection: "up" | "down" | "flat";
  sampleSize: number;
}

export interface Prediction {
  ctr: number;
  watchTime: number;
  completionRate: number;
  subGain: number;
  engagementRate: number;
  confidence: number; // 0-1
}

export const RecommendationsSchema = z.object({
  items: z
    .array(
      z.object({
        area: z.string(),
        suggestion: z.string(),
        priority: z.enum(["high", "medium", "low"]),
      }),
    )
    .min(1),
});

export const ReportSummarySchema = z.object({
  headline: z.string(),
  wins: z.array(z.string()),
  issues: z.array(z.string()),
  actions: z.array(z.string()),
});
