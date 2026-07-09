import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

interface QueueCount {
  status: string;
  n: number;
}

export default async function SystemDashboard() {
  const counts = await safe(async () => {
    const statuses = ["pending", "running", "done", "failed", "dead", "cancelled"];
    const out: QueueCount[] = [];
    for (const s of statuses) {
      const { count } = await supabaseAdmin()
        .from("queue_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      out.push({ status: s, n: count ?? 0 });
    }
    return out;
  }, [] as QueueCount[]);

  const cost = await safe(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data } = await supabaseAdmin()
      .from("cost_entries")
      .select("kind, amount, created_at")
      .gte("created_at", since);
    const rows = (data as { kind: string; amount: number; created_at: string }[]) ?? [];
    const dayAgo = Date.now() - 86_400_000;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const sum = (from: number) =>
      rows.filter((r) => Date.parse(r.created_at) >= from).reduce((a, r) => a + Number(r.amount), 0);
    return { day: sum(dayAgo), week: sum(weekAgo), month: sum(0) };
  }, { day: 0, week: 0, month: 0 });

  const alerts = await safe(async () => {
    const { data } = await supabaseAdmin()
      .from("alerts")
      .select("kind, severity, message, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    return (data as { kind: string; severity: string; message: string }[]) ?? [];
  }, [] as { kind: string; severity: string; message: string }[]);

  const dead = counts.find((c) => c.status === "dead")?.n ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">System &amp; Pipeline</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Queue</h2>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {counts.map((c) => (
            <div
              key={c.status}
              className={`rounded-xl border p-4 text-center ${
                c.status === "dead" && c.n > 0 ? "border-red-500/60" : "border-white/10"
              }`}
            >
              <div className="text-2xl font-bold">{c.n}</div>
              <div className="text-xs text-muted">{c.status}</div>
            </div>
          ))}
        </div>
        {dead > 0 && (
          <p className="mt-2 text-sm text-red-400">
            {dead} job(s) in the dead-letter queue — inspect and requeue.
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Production cost (USD, estimated)</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Today", cost.day],
            ["7 days", cost.week],
            ["30 days", cost.month],
          ].map(([label, v]) => (
            <div key={label} className="rounded-xl border border-white/10 p-4 text-center">
              <div className="text-2xl font-bold">${(v as number).toFixed(2)}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent alerts</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted">No alerts.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {alerts.map((a, i) => (
              <li key={i} className="flex gap-3 border-b border-white/5 py-1">
                <span
                  className={`text-xs uppercase ${
                    a.severity === "critical" ? "text-red-400" : "text-yellow-400"
                  }`}
                >
                  {a.severity}
                </span>
                <span className="text-muted">{a.kind}</span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
