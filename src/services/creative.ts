import "server-only";
import { chatJSON, visionJSON } from "@/lib/openai";
import {
  HookListSchema,
  TitleListSchema,
  DescriptionListSchema,
  TagsSchema,
  ThumbPromptsSchema,
  ThumbScoresSchema,
  QualitySchema,
  ImprovementSchema,
} from "@/types/creative";
import type { AssetManifest } from "@/types/pipeline";

const N_HOOKS = Number(process.env.CREATIVE_HOOKS ?? 5);
const N_TITLES = Number(process.env.CREATIVE_TITLES ?? 10);
const N_DESCS = Number(process.env.CREATIVE_DESCRIPTIONS ?? 3);
const N_THUMBS = Number(process.env.THUMBNAIL_VARIANTS ?? 5);

/** Compact context string shared across creative calls (keeps tokens low). */
export function ctx(m: AssetManifest): string {
  const sceneSummary = m.scenes
    .map((s) => `#${s.scene_number}(${s.duration}s,${s.camera_motion})`)
    .join(" ");
  return [
    `TOPIC: ${m.topic.title} [${m.topic.category}]`,
    `LANG: ${m.language}`,
    `HOOK: ${m.script.hook}`,
    `BODY: ${m.script.body}`,
    `CTA: ${m.script.cta}`,
    `SCENES: ${m.scenes.length} (${sceneSummary})`,
    `VOICE_SEC: ${m.voice.duration_sec}`,
    `CAPTION_WORDS: ${m.captions.words.length}`,
  ].join("\n");
}

export function generateAndScoreHooks(m: AssetManifest) {
  return chatJSON(
    {
      system:
        "You are a viral short-form hook writer and analyst. Score each hook 0-100 on curiosity, retention (keeps watching), attention (first 3s). `total` is the weighted overall. Return JSON.",
      user: `${ctx(m)}\n\nWrite ${N_HOOKS} distinct opening hooks (first 3 seconds) and score each. JSON: { "hooks": [{text,curiosity,retention,attention,total,reason}] }`,
    },
    HookListSchema,
  );
}

export function generateAndScoreTitles(m: AssetManifest) {
  return chatJSON(
    {
      system:
        "You are a YouTube Shorts SEO title expert. Score each title 0-100 on ctr, intent (search intent match), length (ideal <=70 chars), readability, uniqueness. `total` weighted overall. Return JSON.",
      user: `${ctx(m)}\n\nWrite ${N_TITLES} SEO titles and score each. JSON: { "titles": [{text,ctr,intent,length,readability,uniqueness,total}] }`,
    },
    TitleListSchema,
  );
}

export function generateAndScoreDescriptions(m: AssetManifest) {
  return chatJSON(
    {
      system:
        "You write YouTube descriptions. Score each 0-100 on seo, keywords, natural (natural language), cta. `total` weighted overall. Return JSON.",
      user: `${ctx(m)}\n\nWrite ${N_DESCS} descriptions (2-4 lines, hashtags at end) and score each. JSON: { "descriptions": [{text,seo,keywords,natural,cta,total}] }`,
    },
    DescriptionListSchema,
  );
}

export function generateTags(m: AssetManifest) {
  return chatJSON(
    {
      system:
        "You are a YouTube SEO expert. Return de-duplicated, non-spammy hashtags and keyword tiers. Return JSON.",
      user: `${ctx(m)}\n\nJSON: { "hashtags": ["#..."], "keywords": { "primary": [], "secondary": [], "longtail": [] } }. Hashtags: 5-8 incl #Shorts, no duplicates, no spam.`,
    },
    TagsSchema,
  );
}

export function generateThumbnailPrompts(m: AssetManifest) {
  return chatJSON(
    {
      system:
        "You design high-CTR YouTube thumbnails. Produce prompts using DISTINCT strategies: curiosity, shock, question, numbers, contrast. Each is a vertical 9:16 cinematic text-to-image prompt with clear focal subject and negative space for a text overlay (no text in image). Return JSON.",
      user: `${ctx(m)}\n\nWrite ${N_THUMBS} thumbnail prompts, each a different strategy. JSON: { "prompts": [{strategy, prompt}] }`,
    },
    ThumbPromptsSchema,
  );
}

export function scoreThumbnails(images: { b64: string; mime: string }[]) {
  return visionJSON(
    "You are a thumbnail CTR analyst. Score each image 0-100 on clarity, face_focus, contrast, readability (would text overlay be legible), ctr (click prediction). `total` weighted overall. `index` is the image's 0-based order. Return JSON.",
    `Score these ${images.length} thumbnails. JSON: { "scores": [{index,clarity,face_focus,contrast,readability,ctr,total,reason}] }`,
    images,
    ThumbScoresSchema,
  );
}

export function analyzeQuality(m: AssetManifest, title: string, hook: string) {
  return chatJSON(
    {
      system:
        "You are a short-form video quality analyst. Analyze the described video and score each dimension 0-100 with brief reasons. Dimensions: hook (first 3s curiosity/retention/attention), script (reading level, length, sentence variation, repetition, engagement), caption (timing, readability, highlight timing), scene (durations, transitions, motion, camera), voice (speech rate from words/sec, pauses, energy). Then a viral block: ctr, retention, shareability, seo, novelty, curiosity, and an overall `score` 0-100. Return JSON.",
      user: `${ctx(m)}\nCHOSEN_TITLE: ${title}\nCHOSEN_HOOK: ${hook}\n\nReturn JSON matching {hook:{score,reasons},script:{...},caption:{...},scene:{...},voice:{...},viral:{ctr,retention,shareability,seo,novelty,curiosity,score}}`,
    },
    QualitySchema,
  );
}

export function improveCreative(
  m: AssetManifest,
  current: { hook: string; title: string; description: string },
  weaknesses: string[],
) {
  return chatJSON(
    {
      system:
        "You improve underperforming YouTube Shorts creative. Given the current hook/title/description and identified weaknesses, produce stronger replacements. Return JSON.",
      user: `${ctx(m)}\nCURRENT_HOOK: ${current.hook}\nCURRENT_TITLE: ${current.title}\nCURRENT_DESCRIPTION: ${current.description}\nWEAKNESSES: ${weaknesses.join("; ")}\n\nJSON: { "hook": "", "title": "", "description": "" }`,
    },
    ImprovementSchema,
  );
}
