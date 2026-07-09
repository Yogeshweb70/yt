// Unit tests for the pure analytics calculations.
// Run: node --experimental-strip-types src/services/analytics/calc.test.ts
import {
  engagementRate,
  growthRate,
  trendingDirection,
  uploadConsistency,
  channelHealth,
  predictFromHistory,
  retentionDropoff,
} from "./calc.ts";
import type { MetricPoint } from "../../types/analytics.ts";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}
function approx(name: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}: got ${got} want ~${want}`);
  } else console.log(`ok   ${name}`);
}

// engagementRate
eq("engagement basic", engagementRate({ likes: 5, comments: 3, shares: 2, views: 100 }), 10);
eq("engagement zero views", engagementRate({ likes: 1, comments: 1, shares: 1, views: 0 }), 0);

const mk = (views: number, day: string, extra: Partial<MetricPoint> = {}): MetricPoint => ({
  views,
  ctr: 5,
  averageViewPercentage: 60,
  averageViewDuration: 30,
  subscribersGained: 2,
  likes: 10,
  comments: 5,
  shares: 5,
  publishedAt: `2026-01-${day}T00:00:00Z`,
  ...extra,
});

// growthRate: older avg 100, recent avg 200 => +100%
approx("growth +100%", growthRate([mk(100, "01"), mk(100, "02"), mk(200, "03"), mk(200, "04")]), 100);
eq("growth trending up", trendingDirection(growthRate([mk(100, "01"), mk(300, "02")])), "up");
eq("trend flat", trendingDirection(5), "flat");
eq("trend down", trendingDirection(-25), "down");

// uploadConsistency: evenly spaced daily => 100
eq("consistency even", uploadConsistency([mk(1, "01"), mk(1, "02"), mk(1, "03"), mk(1, "04")]), 100);

// channelHealth aggregates
const ch = channelHealth([mk(100, "01"), mk(300, "02")]);
eq("health avgViews", ch.avgViews, 200);
eq("health avgCtr", ch.avgCtr, 5);
eq("health sample", ch.sampleSize, 2);

// prediction confidence scales with sample size
const pred = predictFromHistory(Array.from({ length: 5 }, (_, i) => mk(100, String(10 + i))));
approx("prediction confidence 0.5", pred.confidence, 0.5);
eq("prediction ctr", pred.ctr, 5);

// retention dropoff: biggest drop between index 1->2
const drop = retentionDropoff([1.0, 0.9, 0.5, 0.45]);
eq("dropoff worst index", drop.worstIndex, 2);

if (failures) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nALL PASS");
}
