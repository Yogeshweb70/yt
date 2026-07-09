import type { AssetManifest, Scene, WordTiming } from "../types/pipeline";

export type { AssetManifest, Scene, WordTiming };

// NOTE: `type` (not `interface`) so these satisfy Remotion's
// `Record<string, unknown>` props constraint.
export type RenderProps = {
  manifest: AssetManifest;
  /** scene_number (as string) -> image URL */
  sceneImages: Record<string, string>;
  musicUrl?: string | null;
  sfx?: { frame: number; src: string }[];
};

export type ThumbProps = {
  imageUrl: string;
  title: string;
};

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const FPS = 60;
