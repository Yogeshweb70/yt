import "server-only";
import { discoverTopics } from "@/services/trends";
import { rankAndSelectTopics } from "@/services/ranking";
import {
  generateResearch,
  generateScript,
  generateScenes,
  generateSeo,
  loadTopic,
} from "@/services/content";
import { generateVoiceAndCaptions } from "@/services/voice";
import { buildAndStoreManifest } from "@/services/manifest";
import { runStage } from "@/services/jobs";
import { log } from "@/lib/logger";
import { LANGUAGES, type Language } from "@/types/pipeline";

export interface PipelineResult {
  topicId: string; // first selected topic (back-compat)
  topicIds: string[];
  manifests: { manifestId: string; language: Language; topicId: string }[];
}

// How many DISTINCT topics to produce per run. Total videos = topics × LANGUAGES.
const DAILY_TOPIC_COUNT = Number(process.env.DAILY_TOPIC_COUNT ?? 3);

/** Per-topic: research → (per language) script → scenes → voice → manifest. */
async function runPipelineForTopic(
  topicId: string,
): Promise<{ manifestId: string; language: Language; topicId: string }[]> {
  const research = await runStage("research", `research:${topicId}`, () =>
    generateResearch(topicId),
  );
  const topic = await loadTopic(topicId);
  const out: { manifestId: string; language: Language; topicId: string }[] = [];

  for (const language of LANGUAGES) {
    const { scriptId, content } = await runStage(
      "script",
      `script:${topicId}:${language}`,
      () => generateScript(topicId, research, language),
    );
    const scenes = await runStage("scenes", `scenes:${scriptId}`, () =>
      generateScenes(scriptId, content, language),
    );
    const { voice, captions } = await runStage("voice", `voice:${scriptId}`, () =>
      generateVoiceAndCaptions(scriptId, content.body, language),
    );
    const { manifestId } = await runStage("manifest", `manifest:${scriptId}`, async () => {
      const seo = await generateSeo(topicId, content, language);
      return buildAndStoreManifest({
        topicId,
        topic,
        scriptId,
        language,
        script: content,
        scenes,
        voice,
        captions,
        seo,
      });
    });
    out.push({ manifestId, language, topicId });
  }
  return out;
}

/**
 * Full Phase 2 content pipeline. Each stage is wrapped in an idempotent,
 * resumable job keyed deterministically, so a re-run continues from the last
 * incomplete stage rather than redoing completed work.
 *
 * `dayStamp` (YYYY-MM-DD) scopes discovery so a same-day re-run resumes the
 * same batch instead of scraping fresh topics.
 */
export async function runPipeline(dayStamp: string): Promise<PipelineResult> {
  await log.info("pipeline", `run start ${dayStamp}`);

  await runStage("discover", `discover:${dayStamp}`, discoverTopics);

  const topicIds = await runStage("rank", `rank:${dayStamp}`, async () => {
    const ids = await rankAndSelectTopics(DAILY_TOPIC_COUNT);
    if (ids.length === 0) throw new Error("ranking selected no topics");
    return ids;
  });

  // Produce manifests for each distinct topic. One topic's failure does not
  // sink the others (each topic's stages remain individually resumable).
  const manifests: PipelineResult["manifests"] = [];
  for (const topicId of topicIds) {
    try {
      manifests.push(...(await runPipelineForTopic(topicId)));
    } catch (e) {
      await log.error("pipeline", `topic ${topicId} failed`, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await log.info("pipeline", `run complete ${dayStamp}`, {
    topics: topicIds.length,
    manifests: manifests.length,
  });
  return { topicId: topicIds[0], topicIds, manifests };
}
