import { Composition, Still } from "remotion";
import { ShortVideo } from "./ShortVideo";
import { Thumbnail } from "./Thumbnail";
import { FPS, VIDEO_HEIGHT, VIDEO_WIDTH, type RenderProps, type ThumbProps } from "./types";

const defaultRenderProps: RenderProps = {
  manifest: {
    topic: { id: "", title: "Preview", summary: "", category: "" },
    language: "en",
    script: { hook: "", body: "", cta: "" },
    scenes: [],
    imagePrompts: [],
    voice: { language: "en", audio_url: "", duration_sec: 30, voice_id: "" },
    captions: { language: "en", srt: "", vtt: "", words: [] },
    thumbnailPrompt: "",
    seo: { title: "", description: "", keywords: [], hashtags: [], tags: [] },
  },
  sceneImages: {},
  musicUrl: null,
  sfx: [],
};

const defaultThumbProps: ThumbProps = { imageUrl: "", title: "Preview" };

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Short"
        component={ShortVideo}
        durationInFrames={FPS * 30}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={defaultRenderProps}
        calculateMetadata={({ props }) => {
          const secs = props.manifest?.voice?.duration_sec || 30;
          return { durationInFrames: Math.max(1, Math.ceil(secs * FPS)) };
        }}
      />
      <Still
        id="Thumbnail"
        component={Thumbnail}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={defaultThumbProps}
      />
    </>
  );
};
