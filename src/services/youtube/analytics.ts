import "server-only";
import type { VideoMetrics } from "@/types/analytics";

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

async function j(url: string, token: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

/** Data API statistics (1 quota unit): views/likes/comments. */
async function statistics(token: string, ytId: string) {
  const r = await j(`${DATA}/videos?part=statistics&id=${ytId}`, token);
  const s = (r?.items as { statistics?: Record<string, string> }[] | undefined)?.[0]
    ?.statistics;
  return {
    views: Number(s?.viewCount ?? 0),
    likes: Number(s?.likeCount ?? 0),
    comments: Number(s?.commentCount ?? 0),
  };
}

interface AnalyticsResponse {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
}

function toMap(res: AnalyticsResponse | null): Record<string, number> {
  if (!res?.rows?.[0] || !res.columnHeaders) return {};
  const out: Record<string, number> = {};
  res.columnHeaders.forEach((h, i) => {
    out[h.name] = Number(res.rows![0][i] ?? 0);
  });
  return out;
}

/**
 * Combines Data API statistics + YouTube Analytics API reports into one
 * VideoMetrics. Uses the Analytics API's own quota bucket (separate from the
 * 10k Data API budget). Degrades gracefully — any failed sub-call yields
 * partial data rather than throwing.
 */
export async function fetchVideoMetrics(
  token: string,
  ytId: string,
  startDate: string,
  endDate: string,
): Promise<VideoMetrics> {
  const base = `${ANALYTICS}?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&filters=video==${ytId}`;

  const [stats, core, traffic, search] = await Promise.all([
    statistics(token, ytId),
    j(
      `${base}&metrics=estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,shares,likes,comments,views`,
      token,
    ),
    j(`${base}&metrics=views&dimensions=insightTrafficSourceType`, token),
    j(
      `${base}&metrics=views&dimensions=insightTrafficSourceDetail&filters=video==${ytId};insightTrafficSourceType==YT_SEARCH&sort=-views&maxResults=10`,
      token,
    ),
  ]);

  const cm = toMap(core as AnalyticsResponse | null);
  // Impression metrics live in a separate group; not all channels expose them.
  const impr = toMap(
    (await j(`${base}&metrics=impressions,impressionClickThroughRate`, token)) as
      | AnalyticsResponse
      | null,
  );

  const trafficSources: Record<string, number> = {};
  const tr = traffic as AnalyticsResponse | null;
  tr?.rows?.forEach((row) => {
    trafficSources[String(row[0])] = Number(row[1] ?? 0);
  });

  const searchTerms: { term: string; views: number }[] =
    (search as AnalyticsResponse | null)?.rows?.map((row) => ({
      term: String(row[0]),
      views: Number(row[1] ?? 0),
    })) ?? [];

  return {
    views: cm.views || stats.views,
    likes: cm.likes || stats.likes,
    comments: cm.comments || stats.comments,
    shares: cm.shares ?? 0,
    subscribersGained: cm.subscribersGained ?? 0,
    estimatedMinutesWatched: cm.estimatedMinutesWatched ?? 0,
    averageViewDuration: cm.averageViewDuration ?? 0,
    averageViewPercentage: cm.averageViewPercentage ?? 0,
    impressions: impr.impressions ?? null,
    ctr: impr.impressionClickThroughRate ?? null,
    uniqueViewers: null,
    trafficSources,
    searchTerms,
  };
}

/** Audience retention ratios (elapsed 0..1) for scene mapping. */
export async function fetchRetention(
  token: string,
  ytId: string,
  startDate: string,
  endDate: string,
): Promise<number[]> {
  const res = (await j(
    `${ANALYTICS}?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&filters=video==${ytId}&metrics=audienceWatchRatio&dimensions=elapsedVideoTimeRatio&sort=elapsedVideoTimeRatio`,
    token,
  )) as AnalyticsResponse | null;
  return res?.rows?.map((r) => Number(r[1] ?? 0)) ?? [];
}
