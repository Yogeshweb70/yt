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

/** Called at each sub-step boundary so the dashboard can show the current step
 *  (label) and a monotonic percentage. */
export type ProgressReporter = (pct: number, stage: string) => void | Promise<void>;

/** Per-topic: research → (per language) script → scenes → voice → manifest. */
async function runPipelineForTopic(
  topicId: string,
  report: ProgressReporter,
  span: { base: number; width: number },
): Promise<{ manifestId: string; language: Language; topicId: string }[]> {
  // Sub-steps we surface, in order, mapped to the fraction reached when each
  // one *starts*. Voice/manifest sit late in the per-topic slice.
  const at = (frac: number) => Math.round(span.base + span.width * frac);

  await report(at(0), "Topic");
  const research = await runStage("research", `research:${topicId}`, () =>
    generateResearch(topicId),
  );
  const topic = await loadTopic(topicId);
  const out: { manifestId: string; language: Language; topicId: string }[] = [];

  for (const [li, language] of LANGUAGES.entries()) {
    // Interleave languages across the topic's remaining span so the bar keeps
    // moving forward for multi-language runs.
    const lb = 0.15 + (0.85 * li) / LANGUAGES.length;
    const lw = (0.85 / LANGUAGES.length);
    await report(at(lb), "Script");
    const { scriptId, content } = await runStage(
      "script",
      `script:${topicId}:${language}`,
      () => generateScript(topicId, research, language),
    );
    const scenes = await runStage("scenes", `scenes:${scriptId}`, () =>
      generateScenes(scriptId, content, language),
    );
    await report(at(lb + lw * 0.4), "Voice");
    const { voice, captions } = await runStage("voice", `voice:${scriptId}`, () =>
      generateVoiceAndCaptions(scriptId, content.body, language),
    );
    await report(at(lb + lw * 0.7), "Manifest");
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
export async function runPipeline(
  dayStamp: string,
  report: ProgressReporter = () => {},
): Promise<PipelineResult> {
  await log.info("pipeline", `run start ${dayStamp}`);

  await report(2, "Topic");
  await runStage("discover", `discover:${dayStamp}`, discoverTopics);

  const topicIds = await runStage("rank", `rank:${dayStamp}`, async () => {
    const ids = await rankAndSelectTopics(DAILY_TOPIC_COUNT);
    if (ids.length === 0) throw new Error("ranking selected no topics");
    return ids;
  });

  // Produce manifests for each distinct topic. One topic's failure does not
  // sink the others (each topic's stages remain individually resumable).
  // Discovery+ranking own 0–15%; the topics share the remaining 15–100%.
  const manifests: PipelineResult["manifests"] = [];
  const width = (100 - 15) / Math.max(1, topicIds.length);
  for (const [ti, topicId] of topicIds.entries()) {
    try {
      manifests.push(
        ...(await runPipelineForTopic(topicId, report, {
          base: 15 + width * ti,
          width,
        })),
      );
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
