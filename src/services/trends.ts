import "server-only";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import type { NormalizedTopic } from "@/types/pipeline";

const xml = new XMLParser({ ignoreAttributes: false });
const GEO = process.env.TRENDS_GEO ?? "US";

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function safe<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (e) {
    await log.warn("trends", `${label} failed`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

async function fromGoogleTrends(): Promise<NormalizedTopic[]> {
  const res = await fetch(
    `https://trends.google.com/trending/rss?geo=${GEO}`,
    { headers: { "User-Agent": "ai-shorts-studio/1.0" } },
  );
  if (!res.ok) throw new Error(`status ${res.status}`);
  const parsed = xml.parse(await res.text());
  const items = parsed?.rss?.channel?.item ?? [];
  const list = Array.isArray(items) ? items : [items];
  return list.map((i: Record<string, unknown>) => ({
    title: String(i.title ?? ""),
    summary: String(i.description ?? i.title ?? ""),
    category: "trending",
    source: "google_trends",
    url: typeof i.link === "string" ? i.link : undefined,
    published_at: i.pubDate ? new Date(String(i.pubDate)).toISOString() : null,
    trend_score: 80,
  }));
}

async function fromReddit(): Promise<NormalizedTopic[]> {
  const res = await fetch(
    "https://www.reddit.com/r/all/top.json?limit=25&t=day",
    { headers: { "User-Agent": "ai-shorts-studio/1.0" } },
  );
  if (!res.ok) throw new Error(`status ${res.status}`);
  const json = (await res.json()) as {
    data: { children: { data: Record<string, unknown> }[] };
  };
  return json.data.children.map(({ data }) => ({
    title: String(data.title ?? ""),
    summary: String(data.selftext || data.title || "").slice(0, 400),
    category: String(data.subreddit ?? "reddit"),
    source: "reddit",
    url: typeof data.url === "string" ? data.url : undefined,
    published_at: data.created_utc
      ? new Date(Number(data.created_utc) * 1000).toISOString()
      : null,
    trend_score: Math.min(100, Math.round(Number(data.score ?? 0) / 500)),
  }));
}

async function fromNews(): Promise<NormalizedTopic[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://newsapi.org/v2/top-headlines?language=en&pageSize=25&apiKey=${key}`,
  );
  if (!res.ok) throw new Error(`status ${res.status}`);
  const json = (await res.json()) as {
    articles: Record<string, unknown>[];
  };
  return json.articles.map((a) => ({
    title: String(a.title ?? ""),
    summary: String(a.description ?? "").slice(0, 400),
    category: "news",
    source: "news_api",
    url: typeof a.url === "string" ? a.url : undefined,
    published_at: a.publishedAt ? String(a.publishedAt) : null,
    trend_score: 60,
  }));
}

async function fromRss(): Promise<NormalizedTopic[]> {
  const feeds = (process.env.RSS_FEEDS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const all: NormalizedTopic[] = [];
  for (const feed of feeds) {
    const res = await fetch(feed, {
      headers: { "User-Agent": "ai-shorts-studio/1.0" },
    });
    if (!res.ok) continue;
    const parsed = xml.parse(await res.text());
    const items = parsed?.rss?.channel?.item ?? [];
    const list = Array.isArray(items) ? items : [items];
    for (const i of list as Record<string, unknown>[]) {
      all.push({
        title: String(i.title ?? ""),
        summary: String(i.description ?? "").slice(0, 400),
        category: "rss",
        source: new URL(feed).hostname,
        url: typeof i.link === "string" ? i.link : undefined,
        published_at: i.pubDate
          ? new Date(String(i.pubDate)).toISOString()
          : null,
        trend_score: 50,
      });
    }
  }
  return all;
}

/** Step 1: collect, normalize, dedupe, and persist trending topics. */
export async function discoverTopics(): Promise<string[]> {
  const collected = (
    await Promise.all([
      safe("google_trends", fromGoogleTrends),
      safe("reddit", fromReddit),
      safe("news", fromNews),
      safe("rss", fromRss),
    ])
  ).flat();

  const seen = new Set<string>();
  const unique = collected.filter((t) => {
    const key = normalizeTitle(t.title);
    if (!key || key.length < 8 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) {
    await log.warn("trends", "no topics discovered");
    return [];
  }

  const { data, error } = await supabaseAdmin()
    .from("topics")
    .insert(
      unique.map((t) => ({
        title: t.title,
        summary: t.summary,
        category: t.category,
        source: t.source,
        published_at: t.published_at,
        trend_score: t.trend_score,
        raw: { url: t.url },
        status: "new",
      })),
    )
    .select("id");
  if (error) throw error;

  await log.info("trends", `discovered ${unique.length} topics`);
  return (data as { id: string }[]).map((r) => r.id);
}
