import type { Language, NormalizedTopic, Research, ScriptContent } from "@/types/pipeline";

export interface Prompt {
  system: string;
  user: string;
}

const LANG_NAME: Record<Language, string> = { en: "English", hi: "Hindi" };

export function researchPrompt(topic: NormalizedTopic): Prompt {
  return {
    system:
      "You are a research analyst for viral short-form video. Return concise, factual, non-plagiarized research as JSON.",
    user: `Topic: "${topic.title}"
Summary: ${topic.summary}
Category: ${topic.category}

Return JSON with:
- "summary": 2-3 sentence neutral overview
- "key_facts": 4-6 verifiable facts (strings)
- "important_points": 3-5 angles that would retain a viewer

JSON only.`,
  };
}

export function scriptPrompt(
  topic: NormalizedTopic,
  research: Research,
  language: Language,
): Prompt {
  return {
    system: `You are a top YouTube Shorts scriptwriter. Write an ORIGINAL ${LANG_NAME[language]} narration script for a 30-60 second vertical Short. Punchy, spoken cadence, no stage directions. Return JSON.`,
    user: `Topic: ${topic.title}
Research facts: ${research.key_facts.join(" | ")}
Angles: ${research.important_points.join(" | ")}

Write in ${LANG_NAME[language]}. Return JSON:
- "hook": 1 sentence, first 3 seconds, stops the scroll
- "body": the main narration (aim 90-140 spoken words for ~45s)
- "cta": 1 short call to action

JSON only.`,
  };
}

export function scenesPrompt(script: ScriptContent, language: Language): Prompt {
  return {
    system:
      "You are a video storyboard director. Break narration into sequential scenes as JSON. Total duration 30-60s. Each scene 3-8s.",
    user: `Narration (${LANG_NAME[language]}):
HOOK: ${script.hook}
BODY: ${script.body}
CTA: ${script.cta}

Return JSON { "scenes": [...] }. Each scene:
- scene_number (int, from 1)
- duration (seconds, number)
- narration (the exact words spoken in this scene, in ${LANG_NAME[language]})
- visual_description (what is on screen)
- camera_motion (e.g. slow zoom in, pan left, static)
- animation (e.g. text pop, parallax, none)
- transition (to next scene: cut, fade, swipe)
- image_prompt (a rich text-to-image prompt, 9:16 vertical, cinematic, no text overlay)

Concatenated narration must equal the full script. JSON only.`,
  };
}

export function seoPrompt(
  topic: NormalizedTopic,
  script: ScriptContent,
  language: Language,
): Prompt {
  return {
    system:
      "You are a YouTube SEO expert for Shorts. Return high-CTR metadata as JSON.",
    user: `Topic: ${topic.title}
Language: ${LANG_NAME[language]}
Hook: ${script.hook}

Return JSON:
- "title": <=70 chars, high CTR, may use 1 emoji
- "description": 2-4 lines with a hook and hashtags at the end
- "keywords": 8-12 search keywords
- "hashtags": 5-8 (#Shorts included)
- "tags": 10-15 YouTube tags

JSON only.`,
  };
}

export function thumbnailPrompt(topic: NormalizedTopic, hook: string): string {
  return `Vertical 9:16 YouTube Shorts thumbnail, bold cinematic lighting, high contrast, subject-focused, dramatic composition about "${topic.title}". Mood matches hook: "${hook}". Leave clean negative space top-third for a text overlay. No text in the image.`;
}
