import "server-only";
import OpenAI from "openai";
import type { z } from "zod";
import { requireEnv } from "@/lib/env";
import type { Prompt } from "@/prompts";

let client: OpenAI | null = null;

function openai(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return client;
}

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/** Runs a chat completion constrained to JSON and validates it with a Zod
 *  schema. Retries once on parse/validation failure. */
export async function chatJSON<T>(
  prompt: Prompt,
  schema: z.ZodType<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await openai().chat.completions.create({
      model: MODEL,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "{}";
    try {
      return schema.parse(JSON.parse(raw));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `chatJSON validation failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";

/** JSON completion over one or more images (base64). Used for thumbnail scoring. */
export async function visionJSON<T>(
  system: string,
  user: string,
  images: { b64: string; mime: string }[],
  schema: z.ZodType<T>,
): Promise<T> {
  const res = await openai().chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          ...images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mime};base64,${img.b64}`, detail: "low" as const },
          })),
        ],
      },
    ],
  });
  return schema.parse(JSON.parse(res.choices[0]?.message?.content ?? "{}"));
}

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3";
const IMAGE_SIZE = (process.env.OPENAI_IMAGE_SIZE ?? "1024x1792") as
  | "1024x1792"
  | "1792x1024"
  | "1024x1024";

/** Generates a vertical image and returns raw PNG bytes. */
export async function generateImage(prompt: string): Promise<Buffer> {
  const res = await openai().images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: IMAGE_SIZE,
    response_format: "b64_json",
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("image generation returned no data");
  return Buffer.from(b64, "base64");
}
