-- AI Shorts Studio — Phase 4 (YouTube Automation Engine)
-- Additive only. Run after phase3.sql in the Supabase SQL editor.

-- Extend uploads with publish/history/retry fields (Steps 3, 6, 7, 10).
alter table public.uploads add column if not exists retry_count   int not null default 0;
alter table public.uploads add column if not exists published_url text;
alter table public.uploads add column if not exists privacy       text default 'public';
alter table public.uploads add column if not exists scheduled_at   timestamptz;
alter table public.uploads add column if not exists playlist_id    text;
alter table public.uploads add column if not exists channel_id     text;
alter table public.uploads add column if not exists thumbnail_url  text;
alter table public.uploads add column if not exists duration_sec   numeric;
alter table public.uploads add column if not exists updated_at     timestamptz default now();

-- One upload record per video (enables upsert-by-video_id + idempotency).
create unique index if not exists uq_uploads_video on public.uploads(video_id);

-- Daily API quota tracker (Step 8).
create table if not exists public.api_quota (
  date       text primary key,           -- YYYY-MM-DD (UTC)
  units      int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.api_quota enable row level security;
