import "server-only";
import { requireEnv } from "@/lib/env";
import type { Language } from "@/types/pipeline";

const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

function voiceId(language: Language): string {
  const key = language === "hi" ? "ELEVENLABS_VOICE_ID_HI" : "ELEVENLABS_VOICE_ID_EN";
  return requireEnv(key);
}

export interface TtsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface TtsResult {
  audio: Buffer;
  contentType: string;
  alignment: TtsAlignment;
  voiceId: string;
}

/** Text-to-speech with character-level timing, used to derive subtitles
 *  without a separate speech-to-text pass. */
export async function synthesizeWithTimestamps(
  text: string,
  language: Language,
): Promise<TtsResult> {
  const vid = voiceId(language);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${vid}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": requireEnv("ELEVENLABS_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, model_id: MODEL }),
    },
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    audio_base64: string;
    alignment: TtsAlignment;
  };
  return {
    audio: Buffer.from(json.audio_base64, "base64"),
    contentType: "audio/mpeg",
    alignment: json.alignment,
    voiceId: vid,
  };
}
