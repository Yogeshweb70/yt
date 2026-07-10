import { getConnection } from "@/lib/youtube/connection";
import type { YoutubeConnection } from "@/lib/supabase/types";
import { CreateVideoSection } from "./create/CreateVideoSection";
import { PipelineStatus } from "./PipelineStatus";

// Reads live connection state — must not be statically prerendered.
export const dynamic = "force-dynamic";

const panels = [
  "Analytics",
  "Upload Queue",
  "Topic Queue",
  "Prompt Library",
  "Logs",
  "Settings",
  "API Usage",
  "Video Preview",
];

async function loadConnection(): Promise<YoutubeConnection | null> {
  try {
    return await getConnection();
  } catch {
    // Missing env / DB not reachable yet — treat as "not connected".
    return null;
  }
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; reason?: string }>;
}) {
  const { connect, reason } = await searchParams;
  const conn = await loadConnection();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">Admin Dashboard</h1>

      <section className="mb-8 rounded-xl border border-white/10 p-5">
        <h2 className="mb-2 text-lg font-semibold">YouTube connection</h2>
        {conn ? (
          <p className="text-sm text-muted">
            Connected as{" "}
            <span className="text-foreground">
              {conn.channel_title ?? conn.channel_id ?? "unknown channel"}
            </span>
            . Tokens auto-refresh.{" "}
            <a href="/api/auth/google" className="text-primary underline">
              Reconnect
            </a>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              No channel connected. This is the one-time OAuth step.
            </p>
            <a
              href="/api/auth/google"
              className="inline-flex w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              Connect YouTube channel
            </a>
          </div>
        )}
        {connect === "ok" && (
          <p className="mt-3 text-sm text-green-400">Channel connected ✓</p>
        )}
        {connect === "error" && (
          <p className="mt-3 text-sm text-red-400">
            Connection failed{reason ? `: ${reason}` : ""}.
          </p>
        )}
      </section>

      <CreateVideoSection />

      <section className="mb-8 rounded-xl border border-white/10 p-5">
        <h2 className="mb-3 text-lg font-semibold">Pipeline progress</h2>
        <PipelineStatus />
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {panels.map((p) => (
          <div
            key={p}
            className="flex h-28 items-center justify-center rounded-xl border border-white/10 text-center text-sm text-muted"
          >
            {p}
          </div>
        ))}
      </div>
    </main>
  );
}
