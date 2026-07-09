import { AbsoluteFill, Audio, Series, useVideoConfig, interpolate } from "remotion";
import { Scene } from "./components/Scene";
import { Captions } from "./components/Captions";
import type { RenderProps } from "./types";

/** Distributes total duration across scenes proportional to their declared
 *  durations (voice-synced: scenes always fill the narration length). */
function sceneFrames(durations: number[], total: number): number[] {
  const sum = durations.reduce((a, b) => a + b, 0) || 1;
  const frames = durations.map((d) => Math.max(1, Math.round((d / sum) * total)));
  const diff = total - frames.reduce((a, b) => a + b, 0);
  frames[frames.length - 1] += diff; // absorb rounding into last scene
  return frames;
}

export const ShortVideo: React.FC<RenderProps> = ({
  manifest,
  sceneImages,
  musicUrl,
  sfx = [],
}) => {
  const { durationInFrames, fps } = useVideoConfig();
  const scenes = [...manifest.scenes].sort(
    (a, b) => a.scene_number - b.scene_number,
  );
  const frames = sceneFrames(
    scenes.map((s) => s.duration),
    durationInFrames,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Series>
        {scenes.map((scene, i) => (
          <Series.Sequence key={scene.scene_number} durationInFrames={frames[i]}>
            <Scene
              scene={scene}
              imageUrl={sceneImages[String(scene.scene_number)]}
              durationInFrames={frames[i]}
            />
          </Series.Sequence>
        ))}
      </Series>

      <Captions words={manifest.captions.words} />

      {/* Narration */}
      {manifest.voice.audio_url ? <Audio src={manifest.voice.audio_url} /> : null}

      {/* Background music: low, ducked under narration, fades in/out. */}
      {musicUrl ? (
        <Audio
          src={musicUrl}
          volume={(f) =>
            0.12 *
            interpolate(
              f,
              [0, 30, durationInFrames - 45, durationInFrames],
              [0, 1, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}

      {/* Optional sound effects (whoosh/pop/impact) at specific frames. */}
      {sfx.map((s, i) => (
        <Series key={`sfx-${i}`}>
          <Series.Sequence offset={s.frame} durationInFrames={fps}>
            <Audio src={s.src} volume={0.5} />
          </Series.Sequence>
        </Series>
      ))}
    </AbsoluteFill>
  );
};
