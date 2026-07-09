import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateImage } from "@/lib/openai";
import { putObject } from "@/lib/storage";
import { log } from "@/lib/logger";
import type { AssetManifest } from "@/types/pipeline";

interface ImageRow {
  kind: string;
  url: string;
  scene_number?: number | null;
}

/** Reuses an already-generated image for this script+kind(+scene) if present. */
async function existing(
  scriptId: string,
  kind: string,
): Promise<ImageRow[]> {
  const { data } = await supabaseAdmin()
    .from("images")
    .select("kind, url, scene_number")
    .eq("script_id", scriptId)
    .eq("kind", kind);
  return (data as ImageRow[]) ?? [];
}

/**
 * Renders scene images from the manifest's image prompts, uploads them to R2,
 * and returns a map of scene_number -> URL. Idempotent: existing images are
 * reused instead of regenerated (cost + resume safety).
 */
export async function ensureSceneImages(
  scriptId: string,
  manifest: AssetManifest,
): Promise<Record<string, string>> {
  const prior = await existing(scriptId, "visual");
  const byScene = new Map<number, string>();
  for (const r of prior) if (r.scene_number != null) byScene.set(r.scene_number, r.url);

  for (const p of manifest.imagePrompts) {
    if (byScene.has(p.scene_number)) continue;
    const png = await generateImage(p.prompt);
    const url = await putObject(
      `images/${scriptId}-scene-${p.scene_number}.png`,
      png,
      "image/png",
    );
    await supabaseAdmin().from("images").insert({
      script_id: scriptId,
      kind: "visual",
      scene_number: p.scene_number,
      url,
      prompt: p.prompt,
    });
    byScene.set(p.scene_number, url);
    await log.info("images", `scene ${p.scene_number} image for ${scriptId}`);
  }

  const out: Record<string, string> = {};
  for (const [n, url] of byScene) out[String(n)] = url;
  return out;
}

/** Renders (or reuses) the thumbnail source image from thumbnailPrompt. */
export async function ensureThumbnailImage(
  scriptId: string,
  manifest: AssetManifest,
): Promise<string> {
  const prior = await existing(scriptId, "thumbnail");
  if (prior[0]) return prior[0].url;

  const png = await generateImage(manifest.thumbnailPrompt);
  const url = await putObject(
    `images/${scriptId}-thumbnail.png`,
    png,
    "image/png",
  );
  await supabaseAdmin().from("images").insert({
    script_id: scriptId,
    kind: "thumbnail",
    url,
    prompt: manifest.thumbnailPrompt,
  });
  await log.info("images", `thumbnail image for ${scriptId}`);
  return url;
}
