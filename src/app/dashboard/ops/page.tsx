import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function statusCount(status: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from("queue_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

export default async function OpsDashboard() {
  const [done, dead, pending, running] = await safe(
    () => Promise.all([statusCount("done"), statusCount("dead"), statusCount("pending"), statusCount("running")]),
    [0, 0, 0, 0],
  );
  const total = done + dead;
  const successRate = total > 0 ? Math.round((done / total) * 1000) / 10 : null;

  // p50/p95-ish latency per operation from recent traces.
  const latency = await safe(async () => {
    const { data } = await supabaseAdmin()
      .from("traces")
      .select("name, duration_ms, ok, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const rows = (data as { name: string; duration_ms: number; ok: boolean }[]) ?? [];
    const byName = new Map<string, number[]>();
    for (const r of rows) {
      const arr = byName.get(r.name) ?? [];
      arr.push(r.duration_ms);
      byName.set(r.name, arr);
    }
    return [...byName.entries()].map(([name, ds]) => {
      const sorted = ds.sort((a, b) => a - b);
      const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
      return { name, n: ds.length, p50: pct(50), p95: pct(95) };
    });
  }, [] as { name: string; n: number; p50: number; p95: number }[]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">Operations</h1>

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Success rate", successRate == null ? "—" : `${successRate}%`],
          ["Completed", done],
          ["Dead-letter", dead],
          ["In flight", pending + running],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-xl border border-white/10 p-4 text-center">
            <div className="text-2xl font-bold">{v}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Latency by operation (ms)</h2>
        {latency.length === 0 ? (
          <p className="text-sm text-muted">No traces yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1">Operation</th>
                <th>Samples</th>
                <th>p50</th>
                <th>p95</th>
              </tr>
            </thead>
            <tbody>
              {latency.map((l) => (
                <tr key={l.name} className="border-t border-white/5">
                  <td className="py-1">{l.name}</td>
                  <td>{l.n}</td>
                  <td>{l.p50}</td>
                  <td>{l.p95}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
