// Run: node --experimental-strip-types src/services/queue/backoff.test.ts
import { computeBackoffMs, shouldDeadLetter, isClaimable } from "./backoff.ts";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures++;
    console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  } else console.log(`ok   ${name}`);
}

eq("backoff attempt0", computeBackoffMs(0, 2000, 300000), 2000);
eq("backoff attempt3", computeBackoffMs(3, 2000, 300000), 16000);
eq("backoff capped", computeBackoffMs(30, 2000, 300000), 300000);
eq("backoff negative", computeBackoffMs(-5, 2000, 300000), 2000);

eq("dlq reached", shouldDeadLetter(3, 3), true);
eq("dlq not reached", shouldDeadLetter(2, 3), false);

const now = 1_000_000_000_000;
const base = { status: "pending", run_after: new Date(now - 1000).toISOString(), depends_on: [], locked_at: null };
eq("claimable basic", isClaimable(base, now, true), true);
eq("not claimable future", isClaimable({ ...base, run_after: new Date(now + 60000).toISOString() }, now, true), false);
eq("not claimable running", isClaimable({ ...base, status: "running" }, now, true), false);
eq("not claimable deps", isClaimable(base, now, false), false);
eq("not claimable fresh lock", isClaimable({ ...base, locked_at: new Date(now - 1000).toISOString() }, now, true), false);
eq("claimable stale lock", isClaimable({ ...base, locked_at: new Date(now - 700000).toISOString() }, now, true), true);

if (failures) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
} else console.log("\nALL PASS");
