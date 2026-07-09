import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { WordTiming } from "../types";

const MAX_WORDS_PER_CUE = 5;
const MAX_CUE_SECONDS = 3;

interface Cue {
  start: number;
  end: number;
  words: WordTiming[];
}

function buildCues(words: WordTiming[]): Cue[] {
  const cues: Cue[] = [];
  let cur: WordTiming[] = [];
  for (const w of words) {
    if (cur.length === 0) {
      cur.push(w);
      continue;
    }
    const span = w.end - cur[0].start;
    if (cur.length >= MAX_WORDS_PER_CUE || span > MAX_CUE_SECONDS) {
      cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
      cur = [w];
    } else cur.push(w);
  }
  if (cur.length)
    cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
  return cues;
}

/**
 * Animated word-highlight captions driven by the manifest's word timings.
 * Auto-wraps, pops the active word, and only shows the current cue.
 */
export const Captions: React.FC<{ words: WordTiming[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cues = useMemo(() => buildCues(words), [words]);

  const cue = cues.find((c) => t >= c.start && t <= c.end + 0.15);
  if (!cue) return null;

  const appear = interpolate(t, [cue.start, cue.start + 0.12], [0.9, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 320,
        paddingLeft: 90,
        paddingRight: 90,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          rowGap: 12,
          transform: `scale(${appear})`,
        }}
      >
        {cue.words.map((w, i) => {
          const active = t >= w.start && t <= w.end;
          return (
            // Outer span owns layout + spacing; inner span owns the highlight
            // transform, so scaling the active word never collides with neighbors.
            <span key={i} style={{ padding: "0 14px", display: "inline-block" }}>
              <span
                style={{
                  fontFamily: "Inter, Arial, sans-serif",
                  fontWeight: 800,
                  fontSize: 76,
                  lineHeight: 1.1,
                  color: active ? "#facc15" : "#ffffff",
                  WebkitTextStroke: "3px rgba(0,0,0,0.9)",
                  textShadow: "0 4px 18px rgba(0,0,0,0.7)",
                  transform: active ? "scale(1.12)" : "scale(1)",
                  transformOrigin: "center",
                  display: "inline-block",
                }}
              >
                {w.word}
              </span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
