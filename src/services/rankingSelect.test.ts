// Run: node --experimental-strip-types src/services/rankingSelect.test.ts
import { pickDistinct } from "./rankingSelect.ts";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures++;
    console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  } else console.log(`ok   ${name}`);
}

// Diversity: top item is tech(90) but second tech(80) is skipped in favor of
// news(70) and sports(60) for distinct categories.
const items = [
  { id: "a", category: "tech", rank: 90 },
  { id: "b", category: "tech", rank: 80 },
  { id: "c", category: "news", rank: 70 },
  { id: "d", category: "sports", rank: 60 },
];
eq("distinct 3", pickDistinct(items, 3), ["a", "c", "d"]);

// Backfill: only 2 categories but n=3 => backfills the 2nd tech by rank.
const two = [
  { id: "a", category: "tech", rank: 90 },
  { id: "b", category: "tech", rank: 80 },
  { id: "c", category: "news", rank: 70 },
];
eq("backfill", pickDistinct(two, 3), ["a", "c", "b"]);

eq("n larger than items", pickDistinct(two, 10), ["a", "c", "b"]);
eq("n=1 picks top", pickDistinct(items, 1), ["a"]);
eq("empty", pickDistinct([], 3), []);
eq("null category", pickDistinct([{ id: "x", category: null, rank: 5 }], 3), ["x"]);

if (failures) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
} else console.log("\nALL PASS");
