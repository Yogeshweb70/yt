"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PipelineJob {
  id: string;
  type: string;
  status: string;
  progress: number;
  attempts: number;
  error: string | null;
  updatedAt: string;
}

/** Human label for each job type, shown as the pipeline step name. */
const STEP_LABEL: Record<string, string> = {
  content: "1 · Script & assets — topic → script → voice → manifest",
  autopilot: "2 · Render → optimize → publish",
  analytics: "Analytics sync",
  report: "Daily report",
  learn: "Learning",
  health: "Health snapshot",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-white/10 text-muted",
  running: "bg-blue-500/20 text-blue-300",
  done: "bg-green-500/20 text-green-300",
  failed: "bg-red-500/20 text-red-300",
  dead: "bg-red-500/30 text-red-200",
  cancelled: "bg-white/10 text-muted",
};

function Bar({ pct, status }: { pct: number; status: string }) {
  const color =
    status === "failed" || status === "dead"
      ? "bg-red-400"
      : status === "done"
        ? "bg-green-400"
        : "bg-blue-400";
  const width = status === "done" ? 100 : Math.min(100, Math.max(0, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-white/10">
      <div
        className={`h-full ${color} transition-all duration-500`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/**
 * Live, auto-refreshing pipeline view. Polls /api/queue/status every 3s and
 * shows each job's step, status and % complete while a video is being processed.
 */
export function PipelineStatus() {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/queue/status", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; jobs: PipelineJob[] };
      setJobs(data.jobs ?? []);
    } catch {
      /* transient — keep last known state */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const active = jobs.some((j) => j.status === "running" || j.status === "pending");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span
          className={`inline-block h-2 w-2 rounded-full ${active ? "bg-blue-400 animate-pulse" : "bg-white/20"}`}
        />
        {active ? "Processing — live" : "Idle"} · refreshes every 3s
      </div>

      {!loaded ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted">
          No jobs yet. Click <span className="text-foreground">“Publish a video now”</span> to
          start one.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-white/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  {STEP_LABEL[j.type] ?? j.type}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[j.status] ?? "bg-white/10 text-muted"}`}
                >
                  {j.status}
                  {j.status === "running" ? ` · ${j.progress}%` : ""}
                  {j.attempts > 1 ? ` · try ${j.attempts}` : ""}
                </span>
              </div>
              <Bar pct={j.progress} status={j.status} />
              {j.error && (
                <p className="mt-2 break-words text-xs text-red-400">{j.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
