// Reliability: exercises the REAL runStage() idempotency/resume (Step 7).
import { beforeEach, describe, expect, it } from "vitest";
import { FakeSupabase } from "./support/fakeSupabase";
import { __setSupabaseClientForTests } from "@/lib/supabase/admin";
import { runStage } from "@/services/jobs";

const db = new FakeSupabase();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
__setSupabaseClientForTests(db as any);

beforeEach(() => db.reset());

describe("runStage idempotency + recovery", () => {
  it("runs once and caches the result", async () => {
    let runs = 0;
    const key = "research:topic-1";
    const r1 = await runStage("research", key, async () => { runs++; return { v: 42 }; });
    const r2 = await runStage("research", key, async () => { runs++; return { v: 99 }; });
    expect(runs).toBe(1); // second call returns cached, does NOT re-run
    expect(r1).toEqual({ v: 42 });
    expect(r2).toEqual({ v: 42 });
  });

  it("retries a failing stage on re-run, then succeeds (resume)", async () => {
    const key = "render:v1";
    let attempt = 0;
    await expect(
      runStage("render", key, async () => { attempt++; throw new Error("boom"); }),
    ).rejects.toThrow("boom");
    // Re-run (as a worker retry would): should attempt again and succeed.
    const res = await runStage("render", key, async () => { attempt++; return { done: true }; });
    expect(attempt).toBe(2);
    expect(res).toEqual({ done: true });
    expect(db.tables.jobs[0].status).toBe("done");
  });

  it("stops retrying after max attempts are exhausted", async () => {
    const key = "publish:v1";
    for (let i = 0; i < 3; i++) {
      await expect(
        runStage("publish", key, async () => { throw new Error("always"); }),
      ).rejects.toThrow();
    }
    // 4th re-run: attempts exhausted -> guarded error, fn not executed.
    let ran = false;
    await expect(
      runStage("publish", key, async () => { ran = true; return 1; }),
    ).rejects.toThrow(/exhausted/);
    expect(ran).toBe(false);
  });
});
