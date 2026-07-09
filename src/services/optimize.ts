import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateImage } from "@/lib/openai";
import { putObject } from "@/lib/storage";
import { runStage } from "@/services/jobs";
import { log } from "@/lib/logger";
import {
  generateAndScoreHooks,
  generateAndScoreTitles,
  generateAndScoreDescriptions,
  generateTags,
  generateThumbnailPrompts,
  scoreThumbnails,
  analyzeQuality,
  improveCreative,
} from "@/services/creative";
import type { AssetManifest } from "@/types/pipeline";
import type { Quality } from "@/types/creative";

const GATE = Number(process.env.VIRAL_GATE ?? 80);
const MAX_CYCLES = 3;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const best = <T extends { total: number }>(xs: T[]): T =>
  xs.reduce((a, b) => (b.total > a.total ? b : a));

interface Ctx {
  videoId: string;
  manifestRowId: string;
  manifest: AssetManifest;
}

async function loadContext(videoId: string): Promise<Ctx> {
  const { data: v, error } = await supabaseAdmin()
    .from("videos")
    .select("script_id")
    .eq("id", videoId)
    .single();
  if (error) throw error;
  const scriptId = (v as { script_id: string }).script_id;

  const { data: m } = await supabaseAdmin()
    .from("asset_manifests")
    .select("id, manifest")
    .eq("script_id", scriptId)
    .limit(1)
    .maybeSingle();
  if (!m) throw new Error(`no manifest for video ${videoId}`);
  const row = m as { id: string; manifest: AssetManifest };
  return { videoId, manifestRowId: row.id, manifest: row.manifest };
}

function weaknessesOf(q: Quality): string[] {
  const dims: [string, { score: number; reasons: string[] }][] = [
    ["hook", q.hook],
    ["script", q.script],
    ["caption", q.caption],
    ["scene", q.scene],
    ["voice", q.voice],
  ];
  return dims
    .filter(([, d]) => d.score < GATE)
    .flatMap(([name, d]) => d.reasons.map((r) => `${name}: ${r}`));
}

/**
 * Creative & Quality Optimization Engine. Runs between render and upload:
 * generates and scores hook/title/description/thumbnail variants, scores video
 * quality, and loops up to 3 improvement cycles until the viral score clears
 * the gate. Persists a full creative report and writes the winning title,
 * description, hashtags, tags, and thumbnail back into the manifest + video
 * row so the (unmodified) publisher uploads the best version.
 *
 * Idempotent/resumable via the jobs table (keyed by videoId).
 *
 * Note: the winning HOOK cannot alter already-rendered narration; it is stored
 * in the report and used to steer title/description, not to re-record audio.
 */
export async function optimizeVideo(videoId: string): Promise<{
  viralScore: number;
  cycles: number;
  title: string;
  thumbnailUrl: string;
}> {
  return runStage("optimize", `optimize:${videoId}`, async () => {
    const { manifest, manifestRowId } = await loadContext(videoId);
    const db = supabaseAdmin();

    // Steps 1-5: text creative.
    const [hooksR, titlesR, descsR, tagsR] = await Promise.all([
      generateAndScoreHooks(manifest),
      generateAndScoreTitles(manifest),
      generateAndScoreDescriptions(manifest),
      generateTags(manifest),
    ]);
    let bestHook = best(hooksR.hooks);
    let bestTitle = best(titlesR.titles);
    let bestDesc = best(descsR.descriptions);
    const tags = tagsR.keywords;
    const allTags = [
      ...tags.primary,
      ...tags.secondary,
      ...tags.longtail,
    ].filter((t, i, a) => a.indexOf(t) === i).slice(0, 15);

    // Steps 6-8: thumbnails.
    const { prompts } = await generateThumbnailPrompts(manifest);
    const thumbs = await Promise.all(
      prompts.map(async (p, i) => {
        const buf = await generateImage(p.prompt);
        const url = await putObject(
          `thumbnails/${videoId}-v${i}.png`,
          buf,
          "image/png",
        );
        return { i, strategy: p.strategy, prompt: p.prompt, url, b64: buf.toString("base64") };
      }),
    );
    const thumbScores = await scoreThumbnails(
      thumbs.map((t) => ({ b64: t.b64, mime: "image/png" })),
    );
    const bestThumbScore = best(thumbScores.scores);
    const bestThumb = thumbs.find((t) => t.i === bestThumbScore.index) ?? thumbs[0];

    // Steps 9-14 + 15: quality analysis with gate loop.
    let quality = await analyzeQuality(manifest, bestTitle.text, bestHook.text);
    let cycles = 0;
    while (quality.viral.score < GATE && cycles < MAX_CYCLES) {
      const imp = await improveCreative(
        manifest,
        { hook: bestHook.text, title: bestTitle.text, description: bestDesc.text },
        weaknessesOf(quality),
      );
      const reQuality = await analyzeQuality(manifest, imp.title, imp.hook);
      cycles++;
      if (reQuality.viral.score > quality.viral.score) {
        bestHook = { ...bestHook, text: imp.hook };
        bestTitle = { ...bestTitle, text: imp.title };
        bestDesc = { ...bestDesc, text: imp.description };
        quality = reQuality;
      } else break; // no improvement — stop early
    }

    // Step 16: persist creative report + variants.
    await Promise.all([
      db.from("title_variants").insert(
        titlesR.titles.map((t) => ({
          video_id: videoId,
          text: t.text,
          ctr: clamp(t.ctr),
          intent: clamp(t.intent),
          length_score: clamp(t.length),
          readability: clamp(t.readability),
          uniqueness: clamp(t.uniqueness),
          total: clamp(t.total),
          chosen: t.text === bestTitle.text,
        })),
      ),
      db.from("thumbnail_variants").insert(
        thumbs.map((t) => {
          const s = thumbScores.scores.find((x) => x.index === t.i);
          return {
            video_id: videoId,
            strategy: t.strategy,
            prompt: t.prompt,
            url: t.url,
            clarity: clamp(s?.clarity ?? 0),
            face_focus: clamp(s?.face_focus ?? 0),
            contrast: clamp(s?.contrast ?? 0),
            readability: clamp(s?.readability ?? 0),
            ctr: clamp(s?.ctr ?? 0),
            total: clamp(s?.total ?? 0),
            chosen: t.i === bestThumb.i,
          };
        }),
      ),
      db.from("creative_scores").insert([
        ...hooksR.hooks.map((h) => ({
          video_id: videoId,
          kind: "hook",
          variant: h.text,
          score: clamp(h.total),
          reasons: { curiosity: h.curiosity, retention: h.retention, attention: h.attention, reason: h.reason },
          chosen: h.text === bestHook.text,
        })),
        ...descsR.descriptions.map((d) => ({
          video_id: videoId,
          kind: "description",
          variant: d.text,
          score: clamp(d.total),
          reasons: { seo: d.seo, keywords: d.keywords, natural: d.natural, cta: d.cta },
          chosen: d.text === bestDesc.text,
        })),
      ]),
    ]);

    await db.from("quality_reports").insert({
      video_id: videoId,
      viral_score: clamp(quality.viral.score),
      cycles,
      hook_score: clamp(quality.hook.score),
      script_score: clamp(quality.script.score),
      caption_score: clamp(quality.caption.score),
      scene_score: clamp(quality.scene.score),
      voice_score: clamp(quality.voice.score),
      report: quality,
      winner: {
        hook: bestHook.text,
        title: bestTitle.text,
        description: bestDesc.text,
        hashtags: tagsR.hashtags,
        thumbnail_url: bestThumb.url,
      },
    });

    // Apply winners into the records the publisher already reads.
    const updated: AssetManifest = {
      ...manifest,
      script: { ...manifest.script, hook: bestHook.text },
      seo: {
        ...manifest.seo,
        title: bestTitle.text,
        description: `${bestDesc.text}\n\n${tagsR.hashtags.join(" ")}`.trim(),
        hashtags: tagsR.hashtags,
        keywords: tags.primary,
        tags: allTags,
      },
    };
    await db.from("asset_manifests").update({ manifest: updated }).eq("id", manifestRowId);
    await db.from("videos").update({ thumbnail_url: bestThumb.url }).eq("id", videoId);

    await log.info("optimize", `video ${videoId} optimized`, {
      viral: clamp(quality.viral.score),
      cycles,
    });
    return {
      viralScore: clamp(quality.viral.score),
      cycles,
      title: bestTitle.text,
      thumbnailUrl: bestThumb.url,
    };
  });
}
