import type { TtsAlignment } from "@/lib/elevenlabs";
import type { Captions, Language, WordTiming } from "@/types/pipeline";

const MAX_WORDS_PER_CUE = 7;
const MAX_CUE_SECONDS = 3.5;

/** Groups character-level TTS alignment into word timings. */
export function toWordTimings(a: TtsAlignment): WordTiming[] {
  const words: WordTiming[] = [];
  let current = "";
  let start = 0;
  let end = 0;
  let open = false;

  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (/\s/.test(ch)) {
      if (open) {
        words.push({ word: current, start, end });
        current = "";
        open = false;
      }
      continue;
    }
    if (!open) {
      start = a.character_start_times_seconds[i] ?? end;
      open = true;
    }
    current += ch;
    end = a.character_end_times_seconds[i] ?? end;
  }
  if (open && current) words.push({ word: current, start, end });
  return words;
}

function fmt(t: number, sep: "," | "."): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(millis, 3)}`;
}

function chunk(words: WordTiming[]): WordTiming[][] {
  const cues: WordTiming[][] = [];
  let cur: WordTiming[] = [];
  for (const w of words) {
    if (cur.length === 0) {
      cur.push(w);
      continue;
    }
    const span = w.end - cur[0].start;
    if (cur.length >= MAX_WORDS_PER_CUE || span > MAX_CUE_SECONDS) {
      cues.push(cur);
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) cues.push(cur);
  return cues;
}

/** Step 8: build SRT, VTT, and word timings from TTS alignment. */
export function buildCaptions(a: TtsAlignment, language: Language): Captions {
  const words = toWordTimings(a);
  const cues = chunk(words);

  const srt = cues
    .map((cue, i) => {
      const start = cue[0].start;
      const end = cue[cue.length - 1].end;
      const text = cue.map((w) => w.word).join(" ");
      return `${i + 1}\n${fmt(start, ",")} --> ${fmt(end, ",")}\n${text}\n`;
    })
    .join("\n");

  const vtt =
    "WEBVTT\n\n" +
    cues
      .map((cue) => {
        const start = cue[0].start;
        const end = cue[cue.length - 1].end;
        const text = cue.map((w) => w.word).join(" ");
        return `${fmt(start, ".")} --> ${fmt(end, ".")}\n${text}\n`;
      })
      .join("\n");

  return { language, srt, vtt, words };
}
