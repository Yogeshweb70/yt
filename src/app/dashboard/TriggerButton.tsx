"use client";

import { useState } from "react";

/**
 * "Publish a video now" button. Enqueues an on-demand content run via the
 * /api/pipeline/trigger route and surfaces the resulting job id (or error).
 * The scheduled pipeline keeps running independently — this just adds one job.
 */
export function TriggerButton() {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onClick() {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pipeline/trigger", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      setMsg(
        data.ok
          ? { ok: true, text: `Queued ✓ — job ${data.jobId?.slice(0, 8)}. A worker will render & publish it.` }
          : { ok: false, text: `Failed: ${data.error}` },
      );
    } catch (e) {
      setMsg({ ok: false, text: `Failed: ${e instanceof Error ? e.message : "network error"}` });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Queuing…" : "▶ Publish a video now"}
      </button>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}
