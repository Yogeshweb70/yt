import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import { log } from "@/lib/logger";
import {
  researchPrompt,
  scriptPrompt,
  scenesPrompt,
  seoPrompt,
} from "@/prompts";
import {
  ResearchSchema,
  ScriptSchema,
  ScenesSchema,
  SeoSchema,
  type Language,
  type NormalizedTopic,
  type Research,
  type Scene,
  type ScriptContent,
  type Seo,
} from "@/types/pipeline";

async function loadTopic(topicId: string): Promise<NormalizedTopic> {
  const { data, error } = await supabaseAdmin()
    .from("topics")
    .select("title, summary, category, source, published_at, trend_score")
    .eq("id", topicId)
    .single();
  if (error) throw error;
  const t = data as Record<string, unknown>;
  return {
    title: String(t.title ?? ""),
    summary: String(t.summary ?? ""),
    category: String(t.category ?? "general"),
    source: String(t.source ?? ""),
    published_at: (t.published_at as string) ?? null,
    trend_score: Number(t.trend_score ?? 0),
  };
}

/** Step 3: research the selected topic and persist it. */
export async function generateResearch(topicId: string): Promise<Research> {
  const topic = await loadTopic(topicId);
  const research = await chatJSON(researchPrompt(topic), ResearchSchema);
  await supabaseAdmin().from("research").upsert(
    {
      topic_id: topicId,
      summary: research.summary,
      key_facts: research.key_facts,
      important_points: research.important_points,
    },
    { onConflict: "topic_id" },
  );
  await log.info("research", `research ready for ${topicId}`);
  return research;
}

/** Step 4: generate a script for one language and persist it. Returns the
 *  new script row id and its content. */
export async function generateScript(
  topicId: string,
  research: Research,
  language: Language,
): Promise<{ scriptId: string; content: ScriptContent }> {
  const topic = await loadTopic(topicId);
  const content = await chatJSON(
    scriptPrompt(topic, research, language),
    ScriptSchema,
  );
  const { data, error } = await supabaseAdmin()
    .from("scripts")
    .insert({
      topic_id: topicId,
      language,
      hook: content.hook,
      body: content.body,
      cta: content.cta,
    })
    .select("id")
    .single();
  if (error) throw error;
  const scriptId = (data as { id: string }).id;
  await log.info("script", `script ${scriptId} (${language}) ready`);
  return { scriptId, content };
}

/** Steps 5 + 6: storyboard scenes (with per-scene image prompts) and persist. */
export async function generateScenes(
  scriptId: string,
  content: ScriptContent,
  language: Language,
): Promise<Scene[]> {
  const { scenes } = await chatJSON(
    scenesPrompt(content, language),
    ScenesSchema,
  );
  await supabaseAdmin()
    .from("scenes")
    .delete()
    .eq("script_id", scriptId); // idempotent regen
  const { error } = await supabaseAdmin().from("scenes").insert(
    scenes.map((s) => ({
      script_id: scriptId,
      scene_number: s.scene_number,
      duration: s.duration,
      narration: s.narration,
      visual_description: s.visual_description,
      camera_motion: s.camera_motion,
      animation: s.animation,
      transition: s.transition,
      image_prompt: s.image_prompt,
    })),
  );
  if (error) throw error;
  await log.info("scenes", `${scenes.length} scenes for script ${scriptId}`);
  return scenes;
}

/** SEO metadata for the manifest. */
export async function generateSeo(
  topicId: string,
  content: ScriptContent,
  language: Language,
): Promise<Seo> {
  const topic = await loadTopic(topicId);
  return chatJSON(seoPrompt(topic, content, language), SeoSchema);
}

export { loadTopic };
