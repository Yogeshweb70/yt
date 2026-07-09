// Pure cost math — no I/O imports, so it is unit-testable in isolation.

export const RATES = {
  chat: Number(process.env.COST_CHAT ?? 0.01), // per chat completion (gpt-4o-mini)
  image: Number(process.env.COST_IMAGE ?? 0.08), // per dall-e-3 1024x1792
  vision: Number(process.env.COST_VISION ?? 0.01), // per vision score
  voicePer1k: Number(process.env.COST_VOICE_PER_1K ?? 0.3), // ElevenLabs per 1k chars
  storage: Number(process.env.COST_STORAGE ?? 0.005), // per video assets
  render: Number(process.env.COST_RENDER ?? 0.02), // per render (compute)
};

export interface CostCounts {
  chatCalls: number;
  images: number;
  visionCalls: number;
  voiceChars: number;
}

/** Coarse per-video USD estimate. NOT billing-grade. */
export function estimateVideoCost(c: CostCounts): {
  chat: number;
  image: number;
  vision: number;
  voice: number;
  storage: number;
  render: number;
  total: number;
} {
  const chat = c.chatCalls * RATES.chat;
  const image = c.images * RATES.image;
  const vision = c.visionCalls * RATES.vision;
  const voice = (c.voiceChars / 1000) * RATES.voicePer1k;
  const storage = RATES.storage;
  const render = RATES.render;
  const total =
    Math.round((chat + image + vision + voice + storage + render) * 10000) / 10000;
  return { chat, image, vision, voice, storage, render, total };
}
