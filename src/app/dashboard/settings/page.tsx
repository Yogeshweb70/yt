import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export default async function SettingsDashboard() {
  const secrets = await safe(async () => {
    const { data } = await supabaseAdmin().from("secrets").select("provider, fingerprint");
    return (data as { provider: string; fingerprint: string }[]) ?? [];
  }, [] as { provider: string; fingerprint: string }[]);

  const providers = ["openai", "elevenlabs", "google", "cloudflare", "supabase"];

  const webhooks = await safe(async () => {
    const { data } = await supabaseAdmin().from("webhooks").select("url, events, active");
    return (data as { url: string; events: string[]; active: boolean }[]) ?? [];
  }, [] as { url: string; events: string[]; active: boolean }[]);

  const audits = await safe(async () => {
    const { data } = await supabaseAdmin()
      .from("audit_logs")
      .select("action, actor, created_at")
      .order("created_at", { ascending: false })
      .limit(12);
    return (data as { action: string; actor: string; created_at: string }[]) ?? [];
  }, [] as { action: string; actor: string; created_at: string }[]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">API credentials (encrypted at rest)</h2>
        <ul className="flex flex-col gap-2">
          {providers.map((p) => {
            const s = secrets.find((x) => x.provider === p);
            return (
              <li
                key={p}
                className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-2 text-sm"
              >
                <span className="capitalize">{p}</span>
                {s ? (
                  <span className="text-green-400">set · {s.fingerprint}</span>
                ) : (
                  <span className="text-muted">env fallback</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Set via <code>POST /api/secrets</code>. Values are AES-256-GCM encrypted;
          only a fingerprint is shown.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Webhooks</h2>
        {webhooks.length === 0 ? (
          <p className="text-sm text-muted">No webhooks registered.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {webhooks.map((w, i) => (
              <li key={i} className="flex justify-between border-b border-white/5 py-1">
                <span className="truncate pr-2">{w.url}</span>
                <span className="text-muted">{w.events.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent audit log</h2>
        {audits.length === 0 ? (
          <p className="text-sm text-muted">No audit entries.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {audits.map((a, i) => (
              <li key={i} className="flex justify-between border-b border-white/5 py-1">
                <span>{a.action}</span>
                <span>{a.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
