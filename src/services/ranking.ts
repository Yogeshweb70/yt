import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { pickDistinct } from "@/services/rankingSelect";

interface TopicRow {
  id: string;
  title: string;
  category: string | null;
  trend_score: number | null;
}

const EVERGREEN = ["how", "why", "history", "science", "money", "health", "tips"];

/** Heuristic sub-scores (0-100). Real search-volume/competition APIs can
 *  replace these later without changing the interface. */
function scoreTopic(t: TopicRow) {
  const title = t.title.toLowerCase();
  const trend = t.trend_score ?? 50;

  // Shorter, punchier titles tend to convert better.
  const len = t.title.length;
  const ctr =
    (len <= 60 ? 70 : 45) +
    (/\?|\d/.test(title) ? 20 : 0) +
    (/(secret|shocking|why|how|never|best)/.test(title) ? 10 : 0);

  const evergreen = EVERGREEN.some((k) => title.includes(k));
  const retention = evergreen ? 75 : 55;

  // No live competition signal yet — proxy: rarer/longer topics = less competition.
  const competition = len > 40 ? 40 : 65;

  const rank =
    trend * 0.35 +
    Math.min(ctr, 100) * 0.25 +
    retention * 0.2 +
    (100 - competition) * 0.1 +
    (evergreen ? 100 : 0) * 0.1;

  return {
    trend_score: trend,
    ctr_potential: Math.min(ctr, 100),
    retention,
    competition,
    rank_score: Math.round(rank * 100) / 100,
  };
}

/** Step 2: rank all `new` topics, persist scores, and select the best. */
export async function rankAndSelectTopic(): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("topics")
    .select("id, title, category, trend_score")
    .eq("status", "new");
  if (error) throw error;

  const rows = (data as TopicRow[]) ?? [];
  if (rows.length === 0) {
    await log.warn("ranking", "no new topics to rank");
    return null;
  }

  let best: { id: string; rank: number } | null = null;
  for (const row of rows) {
    const s = scoreTopic(row);
    await supabaseAdmin().from("topics").update(s).eq("id", row.id);
    if (!best || s.rank_score > best.rank) {
      best = { id: row.id, rank: s.rank_score };
    }
  }

  if (best) {
    await supabaseAdmin()
      .from("topics")
      .update({ status: "selected" })
      .eq("id", best.id);
    await log.info("ranking", `selected topic ${best.id}`, { rank: best.rank });
  }
  return best?.id ?? null;
}

/**
 * Selects the top-N DISTINCT `new` topics for a multi-video day. Scores every
 * topic, then greedily picks the highest-ranked topic per category (topical
 * diversity so the day's videos aren't near-duplicates), backfilling by rank if
 * fewer than N distinct categories exist. Marks them `selected`.
 */
export async function rankAndSelectTopics(n: number): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("topics")
    .select("id, title, category, trend_score")
    .eq("status", "new");
  if (error) throw error;

  const rows = (data as TopicRow[]) ?? [];
  if (rows.length === 0) {
    await log.warn("ranking", "no new topics to rank");
    return [];
  }

  const scored = rows.map((row) => {
    const s = scoreTopic(row);
    return { row, s };
  });
  // Persist scores for all.
  await Promise.all(
    scored.map(({ row, s }) => supabaseAdmin().from("topics").update(s).eq("id", row.id)),
  );
  const picked = pickDistinct(
    scored.map(({ row, s }) => ({ id: row.id, category: row.category, rank: s.rank_score })),
    n,
  );

  await supabaseAdmin().from("topics").update({ status: "selected" }).in("id", picked);
  await log.info("ranking", `selected ${picked.length} distinct topics`);
  return picked;
}
