import type { CSSProperties } from "react";
import { interpolate, Easing } from "remotion";
import type { Scene } from "./types";

/**
 * Frame-accurate motion system. Everything is derived from the current local
 * frame (not wall-clock) so renders are deterministic. Maps a scene's
 * camera_motion / animation / transition text to concrete transforms.
 */
export function sceneMotion(
  scene: Scene,
  frame: number,
  durationInFrames: number,
): { container: CSSProperties; image: CSSProperties } {
  const cam = (scene.camera_motion ?? "").toLowerCase();
  const anim = (scene.animation ?? "").toLowerCase();
  const trans = (scene.transition ?? "").toLowerCase();
  const fadeFrames = 10;

  // Scene-level opacity (transition in/out).
  const wantsFade = trans.includes("fade") || anim.includes("fade");
  const opacity = wantsFade
    ? interpolate(
        frame,
        [0, fadeFrames, durationInFrames - fadeFrames, durationInFrames],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : interpolate(frame, [0, fadeFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  const p = (from: number, to: number) =>
    interpolate(frame, [0, durationInFrames], [from, to], {
      easing: Easing.inOut(Easing.ease),
      extrapolateRight: "clamp",
    });

  // Base Ken Burns zoom so no scene is ever static/flat.
  let scale = p(1.06, 1.16);
  let translateX = 0;
  let translateY = 0;
  let rotate = 0;
  let blur = 0;

  if (cam.includes("zoom out")) scale = p(1.18, 1.04);
  else if (cam.includes("zoom")) scale = p(1.05, 1.2);

  if (cam.includes("pan left") || cam.includes("left")) translateX = p(4, -4);
  else if (cam.includes("pan right") || cam.includes("right"))
    translateX = p(-4, 4);
  if (cam.includes("up")) translateY = p(4, -4);
  else if (cam.includes("down")) translateY = p(-4, 4);

  if (anim.includes("parallax")) translateX += p(-3, 3);
  if (anim.includes("rotate")) rotate = p(-2, 2);
  if (anim.includes("blur"))
    blur = interpolate(frame, [0, fadeFrames], [12, 0], {
      extrapolateRight: "clamp",
    });

  // Slide in the whole scene container for "slide"/"swipe" transitions.
  let containerX = 0;
  if (trans.includes("slide") || trans.includes("swipe")) {
    containerX = interpolate(frame, [0, fadeFrames], [100, 0], {
      easing: Easing.out(Easing.cubic),
      extrapolateRight: "clamp",
    });
  }

  return {
    container: {
      opacity,
      transform: `translateX(${containerX}%)`,
    },
    image: {
      transform: `scale(${scale}) translate(${translateX}%, ${translateY}%) rotate(${rotate}deg)`,
      filter: blur > 0 ? `blur(${blur}px)` : undefined,
    },
  };
}
