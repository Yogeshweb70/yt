# AI Shorts Studio

Automated pipeline that discovers trending topics, generates original
30–60s scripts (EN/HI), narrates and renders 1080×1920 Shorts, then
schedules and publishes to YouTube — with an admin dashboard and an
analytics feedback loop.

> **Status:** Phase 0 (foundation) complete and bootable. See
> [`CONTINUE.md`](./CONTINUE.md) for the full roadmap and current progress.

## Architecture

- **Web** (Next.js 15 / React 19) — dashboard, OAuth, server actions.
- **Worker** (separate container) — Remotion + FFmpeg rendering. *Not*
  runnable on Vercel serverless (timeout + no ffmpeg).
- **Supabase** — Postgres + auth + RLS. Schema in [`supabase/schema.sql`](./supabase/schema.sql).
- **Cloudflare R2** — audio, images, rendered MP4s.
- **External APIs** — OpenAI, ElevenLabs, YouTube Data v3, Reddit, News.

```
topic discovery → rank → script(EN/HI) → voice → subtitles → visuals
      → Remotion render → thumbnail → SEO → upload queue (review)
      → schedule (3/day) → publish → analytics → feedback
```

## Quick start

```bash
cp .env.example .env      # fill in keys
npm install
npm run dev               # http://localhost:3000
```

Apply the DB schema in the Supabase SQL editor (paste `supabase/schema.sql`).

## Docs

- [SETUP.md](./SETUP.md) — API keys, OAuth consent screen, Supabase.
- [DEPLOY.md](./DEPLOY.md) — Vercel (web) + container host (worker).

## Important constraints

- **YouTube quota**: ~6 uploads/day on default quota (1,600 units each).
- **Policy**: keep human review on the upload queue before full autopilot to
  avoid Spam/Repetitious-content strikes.
- **OAuth**: refresh tokens must be stored and rotated; handle `invalid_grant`.
