// Config for the Remotion CLI/Studio (`npx remotion studio src/remotion/index.ts`).
// Programmatic rendering (src/services/render.ts) does not use this file.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setConcurrency(2);
