"use client";

import { useState, useTransition } from "react";
import { triggerVideoNow } from "./actions";

/**
 * "Publish a video now" button. Enqueues an on-demand content run via a server
 * action and surfaces the resulting job id (or error). The scheduled pipeline
 * keeps running independently — this just adds one extra job to the queue.
 */
export function TriggerButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const res = await triggerVideoNow();
      setMsg(
        res.ok
          ? { ok: true, text: `Queued ✓ — job ${res.jobId?.slice(0, 8)}. A worker will render & publish it.` }
          : { ok: false, text: `Failed: ${res.error}` },
      );
    });
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
