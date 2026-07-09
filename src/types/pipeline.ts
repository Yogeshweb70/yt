import { z } from "zod";

export type Language = "en" | "hi";
export const LANGUAGES: Language[] = ["en", "hi"];

export interface NormalizedTopic {
  title: string;
  summary: string;
  category: string;
  source: string;
  url?: string;
  published_at: string | null;
  trend_score: number;
}

export const ResearchSchema = z.object({
  summary: z.string(),
  key_facts: z.array(z.string()).min(1),
  important_points: z.array(z.string()).min(1),
});
export type Research = z.infer<typeof ResearchSchema>;

export const ScriptSchema = z.object({
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
});
export type ScriptContent = z.infer<typeof ScriptSchema>;

export const SceneSchema = z.object({
  scene_number: z.number().int().positive(),
  duration: z.number().positive(),
  narration: z.string(),
  visual_description: z.string(),
  camera_motion: z.string(),
  animation: z.string(),
  transition: z.string(),
  image_prompt: z.string(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScenesSchema = z.object({
  scenes: z.array(SceneSchema).min(3).max(10),
});

export const SeoSchema = z.object({
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
  hashtags: z.array(z.string()),
  tags: z.array(z.string()),
});
export type Seo = z.infer<typeof SeoSchema>;

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface Captions {
  language: Language;
  srt: string;
  vtt: string;
  words: WordTiming[];
}

export interface VoiceAsset {
  language: Language;
  audio_url: string;
  duration_sec: number;
  voice_id: string;
}

export interface AssetManifest {
  topic: {
    id: string;
    title: string;
    summary: string;
    category: string;
  };
  language: Language;
  script: ScriptContent;
  scenes: Scene[];
  imagePrompts: { scene_number: number; prompt: string }[];
  voice: VoiceAsset;
  captions: Captions;
  thumbnailPrompt: string;
  seo: Seo;
}
