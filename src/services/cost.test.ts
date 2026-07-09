// Run: node --experimental-strip-types src/services/cost.test.ts
import { estimateVideoCost } from "./costCalc.ts";

let failures = 0;
function approx(name: string, got: number, want: number, tol = 0.0001) {
  if (Math.abs(got - want) > tol) {
    failures++;
    console.error(`FAIL ${name}: got ${got} want ${want}`);
  } else console.log(`ok   ${name}`);
}

// Defaults: chat .01, image .08, vision .01, voice .30/1k, storage .005, render .02
const c = estimateVideoCost({ chatCalls: 4, images: 5, visionCalls: 1, voiceChars: 2000 });
approx("chat", c.chat, 0.04);
approx("image", c.image, 0.4);
approx("vision", c.vision, 0.01);
approx("voice 2k chars", c.voice, 0.6);
approx("total", c.total, 0.04 + 0.4 + 0.01 + 0.6 + 0.005 + 0.02);

const zero = estimateVideoCost({ chatCalls: 0, images: 0, visionCalls: 0, voiceChars: 0 });
approx("zero total = storage+render", zero.total, 0.025);

if (failures) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
} else console.log("\nALL PASS");
