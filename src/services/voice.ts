import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { synthesizeWithTimestamps, type TtsAlignment } from "@/lib/elevenlabs";
import { putObject } from "@/lib/storage";
import { buildCaptions } from "@/services/captions";
import { log } from "@/lib/logger";
import type { Captions, Language, VoiceAsset } from "@/types/pipeline";

/** Steps 7 + 8: synthesize narration, store the audio in R2, and derive
 *  subtitles from the TTS alignment. */
export async function generateVoiceAndCaptions(
  scriptId: string,
  narration: string,
  language: Language,
): Promise<{ voice: VoiceAsset; captions: Captions }> {
  const tts = await synthesizeWithTimestamps(narration, language);
  const audioUrl = await putObject(
    `voice/${scriptId}-${language}.mp3`,
    tts.audio,
    tts.contentType,
  );
  const durationSec = lastEnd(tts.alignment);

  const { data, error } = await supabaseAdmin()
    .from("voices")
    .insert({
      script_id: scriptId,
      provider: "elevenlabs",
      voice_id: tts.voiceId,
      language,
      audio_url: audioUrl,
      duration_sec: durationSec,
    })
    .select("id")
    .single();
  if (error) throw error;
  const voiceId = (data as { id: string }).id;

  const captions = buildCaptions(tts.alignment, language);
  await supabaseAdmin().from("captions").insert({
    voice_id: voiceId,
    language,
    srt: captions.srt,
    vtt: captions.vtt,
    words: captions.words,
  });

  await log.info("voice", `voice + captions for script ${scriptId} (${language})`);
  return {
    voice: {
      language,
      audio_url: audioUrl,
      duration_sec: durationSec,
      voice_id: tts.voiceId,
    },
    captions,
  };
}

function lastEnd(a: TtsAlignment): number {
  const ends = a.character_end_times_seconds;
  return ends.length ? ends[ends.length - 1] : 0;
}
