import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Report {
  id: string;
  video_id: string;
  viral_score: number;
  cycles: number;
  hook_score: number;
  script_score: number;
  caption_score: number;
  scene_score: number;
  voice_score: number;
  winner: { title?: string; thumbnail_url?: string } | null;
  created_at: string;
}
interface ThumbVariant {
  url: string;
  strategy: string;
  total: number;
  chosen: boolean;
}
interface TitleVariant {
  text: string;
  total: number;
  chosen: boolean;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export default async function CreativeDashboard() {
  const reports = await safe(async () => {
    const { data } = await supabaseAdmin()
      .from("quality_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    return (data as Report[]) ?? [];
  }, [] as Report[]);

  const latest = reports[0];
  const thumbs = latest
    ? await safe(async () => {
        const { data } = await supabaseAdmin()
          .from("thumbnail_variants")
          .select("url, strategy, total, chosen")
          .eq("video_id", latest.video_id)
          .order("total", { ascending: false });
        return (data as ThumbVariant[]) ?? [];
      }, [] as ThumbVariant[])
    : [];
  const titles = latest
    ? await safe(async () => {
        const { data } = await supabaseAdmin()
          .from("title_variants")
          .select("text, total, chosen")
          .eq("video_id", latest.video_id)
          .order("total", { ascending: false });
        return (data as TitleVariant[]) ?? [];
      }, [] as TitleVariant[])
    : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-bold">Creative Optimization</h1>

      {!latest ? (
        <p className="text-sm text-muted">
          No quality reports yet. Reports appear here after a video is optimized.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="rounded-xl border border-white/10 p-5">
            <div className="mb-4 flex items-center gap-4">
              <span className="text-5xl font-black text-primary">
                {latest.viral_score}
              </span>
              <div className="text-sm text-muted">
                <div>Viral score (0-100)</div>
                <div>{latest.cycles} optimization cycle(s)</div>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3 text-center text-xs">
              {[
                ["Hook", latest.hook_score],
                ["Script", latest.script_score],
                ["Caption", latest.caption_score],
                ["Scene", latest.scene_score],
                ["Voice", latest.voice_score],
              ].map(([label, v]) => (
                <div key={label} className="rounded-lg border border-white/10 p-3">
                  <div className="text-lg font-bold">{v}</div>
                  <div className="text-muted">{label}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Thumbnail comparison</h2>
            <div className="grid grid-cols-3 gap-4 md:grid-cols-5">
              {thumbs.map((t, i) => (
                <div
                  key={i}
                  className={`overflow-hidden rounded-lg border ${
                    t.chosen ? "border-primary" : "border-white/10"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.url} alt={t.strategy} className="aspect-[9/16] w-full object-cover" />
                  <div className="p-2 text-center text-xs">
                    <div className="font-medium">{t.strategy}</div>
                    <div className="text-muted">
                      {t.total}
                      {t.chosen ? " · winner" : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Title comparison</h2>
            <ul className="flex flex-col gap-2">
              {titles.map((t, i) => (
                <li
                  key={i}
                  className={`flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${
                    t.chosen ? "border-primary" : "border-white/10"
                  }`}
                >
                  <span>{t.text}</span>
                  <span className="text-muted">{t.total}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Optimization history</h2>
            <ul className="flex flex-col gap-1 text-sm text-muted">
              {reports.map((r) => (
                <li key={r.id} className="flex justify-between border-b border-white/5 py-1">
                  <span>{r.winner?.title ?? r.video_id}</span>
                  <span>
                    viral {r.viral_score} · {r.cycles} cycles
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
