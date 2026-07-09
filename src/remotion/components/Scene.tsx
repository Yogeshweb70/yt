import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { sceneMotion } from "../motion";
import type { Scene as SceneType } from "../types";

/**
 * A single storyboard scene: a full-bleed image with frame-driven motion,
 * a readability gradient, and an optional on-screen text/icon layer.
 */
export const Scene: React.FC<{
  scene: SceneType;
  imageUrl?: string;
  durationInFrames: number;
}> = ({ scene, imageUrl, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { container, image } = sceneMotion(scene, frame, durationInFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", ...container }}>
      {imageUrl ? (
        <Img
          src={imageUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            ...image,
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(circle at 50% 40%, #1e293b, #020617)",
          }}
        />
      )}
      {/* Bottom gradient keeps captions readable over any image. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 45%)",
        }}
      />
    </AbsoluteFill>
  );
};
