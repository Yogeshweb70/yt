import { z } from "zod";

// Scores are 0-100. Not max-constrained to avoid retry loops on model drift;
// callers clamp when persisting.
const score = z.number();

export const HookListSchema = z.object({
  hooks: z
    .array(
      z.object({
        text: z.string(),
        curiosity: score,
        retention: score,
        attention: score,
        total: score,
        reason: z.string(),
      }),
    )
    .min(1),
});

export const TitleListSchema = z.object({
  titles: z
    .array(
      z.object({
        text: z.string(),
        ctr: score,
        intent: score,
        length: score,
        readability: score,
        uniqueness: score,
        total: score,
      }),
    )
    .min(1),
});

export const DescriptionListSchema = z.object({
  descriptions: z
    .array(
      z.object({
        text: z.string(),
        seo: score,
        keywords: score,
        natural: score,
        cta: score,
        total: score,
      }),
    )
    .min(1),
});

export const TagsSchema = z.object({
  hashtags: z.array(z.string()),
  keywords: z.object({
    primary: z.array(z.string()),
    secondary: z.array(z.string()),
    longtail: z.array(z.string()),
  }),
});

export const ThumbPromptsSchema = z.object({
  prompts: z
    .array(z.object({ strategy: z.string(), prompt: z.string() }))
    .min(1),
});

export const ThumbScoresSchema = z.object({
  scores: z
    .array(
      z.object({
        index: z.number().int(),
        clarity: score,
        face_focus: score,
        contrast: score,
        readability: score,
        ctr: score,
        total: score,
        reason: z.string(),
      }),
    )
    .min(1),
});

const dimension = z.object({ score, reasons: z.array(z.string()) });

export const QualitySchema = z.object({
  hook: dimension,
  script: dimension,
  caption: dimension,
  scene: dimension,
  voice: dimension,
  viral: z.object({
    ctr: score,
    retention: score,
    shareability: score,
    seo: score,
    novelty: score,
    curiosity: score,
    score, // overall 0-100
  }),
});

export const ImprovementSchema = z.object({
  hook: z.string(),
  title: z.string(),
  description: z.string(),
});

export type Quality = z.infer<typeof QualitySchema>;
export type ScoredTitle = z.infer<typeof TitleListSchema>["titles"][number];
export type ScoredThumb = z.infer<typeof ThumbScoresSchema>["scores"][number];
