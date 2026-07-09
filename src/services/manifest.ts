import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { thumbnailPrompt } from "@/prompts";
import type {
  AssetManifest,
  Captions,
  Language,
  NormalizedTopic,
  Scene,
  ScriptContent,
  Seo,
  VoiceAsset,
} from "@/types/pipeline";

/** Step 9: assemble the render-ready manifest and persist it. */
export async function buildAndStoreManifest(input: {
  topicId: string;
  topic: NormalizedTopic;
  scriptId: string;
  language: Language;
  script: ScriptContent;
  scenes: Scene[];
  voice: VoiceAsset;
  captions: Captions;
  seo: Seo;
}): Promise<{ manifestId: string; manifest: AssetManifest }> {
  const manifest: AssetManifest = {
    topic: {
      id: input.topicId,
      title: input.topic.title,
      summary: input.topic.summary,
      category: input.topic.category,
    },
    language: input.language,
    script: input.script,
    scenes: input.scenes,
    imagePrompts: input.scenes.map((s) => ({
      scene_number: s.scene_number,
      prompt: s.image_prompt,
    })),
    voice: input.voice,
    captions: input.captions,
    thumbnailPrompt: thumbnailPrompt(input.topic, input.script.hook),
    seo: input.seo,
  };

  const { data, error } = await supabaseAdmin()
    .from("asset_manifests")
    .insert({
      topic_id: input.topicId,
      script_id: input.scriptId,
      language: input.language,
      manifest,
      status: "ready",
    })
    .select("id")
    .single();
  if (error) throw error;

  const manifestId = (data as { id: string }).id;
  await log.info("manifest", `manifest ${manifestId} (${input.language}) ready`);
  return { manifestId, manifest };
}
