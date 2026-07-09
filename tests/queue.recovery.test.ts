// Reliability: exercises the REAL queue.ts against an in-memory DB.
// Covers Step 2 (failure recovery) + Step 7 (resume/idempotent recovery).
// Backoff is zeroed via vitest.config `test.env` so retries are claimable now.
import { beforeEach, describe, expect, it } from "vitest";
import { FakeSupabase } from "./support/fakeSupabase";
import { __setSupabaseClientForTests } from "@/lib/supabase/admin";
import { enqueue, claimNext, complete, fail } from "@/services/queue/queue";

const db = new FakeSupabase();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
__setSupabaseClientForTests(db as any);

beforeEach(() => db.reset());

/** Drives a job through the real queue with a handler that fails `failN` times. */
async function drain(failN: number, maxAttempts = 3) {
  let calls = 0;
  for (let i = 0; i < 10; i++) {
    const job = await claimNext("w1");
    if (!job) break;
    try {
      calls++;
      if (calls <= failN) throw new Error("simulated external failure");
      await complete(job.id, { ok: true });
    } catch (e) {
      await fail(job, (e as Error).message);
    }
  }
  return calls;
}

describe("queue reliability", () => {
  it("claims, runs, completes a job", async () => {
    await enqueue("content", { maxAttempts: 3 });
    const calls = await drain(0);
    expect(calls).toBe(1);
    expect(db.tables.queue_jobs[0].status).toBe("done");
  });

  it("recovers from a transient failure (retry then succeed)", async () => {
    await enqueue("content", { maxAttempts: 3 });
    const calls = await drain(1); // fail once, then succeed
    expect(calls).toBe(2);
    expect(db.tables.queue_jobs[0].status).toBe("done");
    expect(db.tables.queue_jobs[0].attempts).toBe(1);
  });

  it("dead-letters after exhausting max attempts", async () => {
    await enqueue("content", { maxAttempts: 3 });
    await drain(99, 3); // always fails
    const job = db.tables.queue_jobs[0];
    expect(job.status).toBe("dead");
    expect(job.attempts).toBe(3);
  });

  it("is idempotent on enqueue (same idempotencyKey => one job)", async () => {
    const a = await enqueue("content", { idempotencyKey: "day:2026-07-09" });
    const b = await enqueue("content", { idempotencyKey: "day:2026-07-09" });
    expect(a).toBe(b);
    expect(db.tables.queue_jobs.length).toBe(1);
  });

  it("gates on dependencies until they complete", async () => {
    const dep = await enqueue("analytics", {});
    await enqueue("report", { dependsOn: [dep] });
    // report is blocked; only analytics is claimable
    const first = await claimNext("w1");
    expect(first?.type).toBe("analytics");
    const blocked = await claimNext("w1");
    expect(blocked).toBeNull(); // report still gated
    await complete(dep, {});
    const now = await claimNext("w1");
    expect(now?.type).toBe("report");
  });

  it("does not double-claim a running job (crash-safe lock guard)", async () => {
    await enqueue("content", {});
    const a = await claimNext("w1");
    const b = await claimNext("w2"); // second worker must not grab the same job
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });
});
