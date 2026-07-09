import { AbsoluteFill, Img } from "remotion";
import type { ThumbProps } from "./types";

/** Static thumbnail: manifest image + bold title overlay in the top third. */
export const Thumbnail: React.FC<ThumbProps> = ({ imageUrl, title }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {imageUrl ? (
        <Img
          src={imageUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 40%)",
        }}
      />
      <AbsoluteFill style={{ padding: 80, justifyContent: "flex-start" }}>
        <h1
          style={{
            fontFamily: "Inter, Arial, sans-serif",
            fontWeight: 900,
            fontSize: 110,
            lineHeight: 1.05,
            color: "#ffffff",
            WebkitTextStroke: "4px rgba(0,0,0,0.9)",
            textShadow: "0 6px 24px rgba(0,0,0,0.8)",
            margin: 0,
          }}
        >
          {title}
        </h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
