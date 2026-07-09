-- AI Shorts Studio — Supabase schema
-- Run in the Supabase SQL editor or via `supabase db push`.

create extension if not exists "pgcrypto";

-- Users (mirrors auth.users; holds app-level profile + connected channel)
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  channel_id    text,
  created_at    timestamptz not null default now()
);

-- Google/YouTube OAuth tokens (one per user). Refresh token is the durable one.
create table if not exists public.oauth_tokens (
  user_id       uuid primary key references public.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  scope         text not null,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);

create table if not exists public.topics (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete cascade,
  title         text not null,
  source        text not null,               -- reddit | youtube | news | trends
  raw           jsonb,
  trend_score   numeric,
  search_volume numeric,
  competition   numeric,
  ctr_potential numeric,
  retention     numeric,
  rank_score    numeric,
  status        text not null default 'new', -- new | selected | used | rejected
  created_at    timestamptz not null default now()
);

create table if not exists public.scripts (
  id            uuid primary key default gen_random_uuid(),
  topic_id      uuid references public.topics(id) on delete set null,
  user_id       uuid references public.users(id) on delete cascade,
  language      text not null default 'en',  -- en | hi
  body          text not null,
  seo           jsonb,                        -- title, description, tags, hashtags
  created_at    timestamptz not null default now()
);

create table if not exists public.voices (
  id            uuid primary key default gen_random_uuid(),
  script_id     uuid references public.scripts(id) on delete cascade,
  provider      text not null default 'elevenlabs',
  voice_id      text,
  audio_url     text,                         -- R2 key
  duration_sec  numeric,
  created_at    timestamptz not null default now()
);

create table if not exists public.images (
  id            uuid primary key default gen_random_uuid(),
  script_id     uuid references public.scripts(id) on delete cascade,
  kind          text not null default 'visual', -- visual | thumbnail
  url           text not null,                   -- R2 key
  prompt        text,
  created_at    timestamptz not null default now()
);

create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  script_id     uuid references public.scripts(id) on delete set null,
  user_id       uuid references public.users(id) on delete cascade,
  url           text,                         -- rendered MP4 in R2
  thumbnail_url text,
  duration_sec  numeric,
  status        text not null default 'draft', -- draft | rendering | rendered | failed
  created_at    timestamptz not null default now()
);

create table if not exists public.schedules (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid references public.videos(id) on delete cascade,
  publish_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.uploads (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid references public.videos(id) on delete cascade,
  user_id       uuid references public.users(id) on delete cascade,
  youtube_id    text,
  status        text not null default 'queued', -- queued | approved | uploading | published | failed
  error         text,
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.analytics (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid references public.uploads(id) on delete cascade,
  fetched_at    timestamptz not null default now(),
  views         bigint default 0,
  ctr           numeric,
  avg_watch_sec numeric,
  likes         bigint default 0,
  comments      bigint default 0,
  subs_gained   bigint default 0
);

create table if not exists public.logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete set null,
  level         text not null default 'info', -- info | warn | error
  scope         text,
  message       text not null,
  meta          jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_topics_user_status on public.topics(user_id, status);
create index if not exists idx_uploads_status on public.uploads(status);
create index if not exists idx_schedules_publish_at on public.schedules(publish_at);

-- Row Level Security: each user sees only their own rows.
alter table public.users        enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.topics       enable row level security;
alter table public.scripts      enable row level security;
alter table public.videos       enable row level security;
alter table public.uploads      enable row level security;
alter table public.logs         enable row level security;

create policy "own_rows_users" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own_rows_tokens" on public.oauth_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_rows_topics" on public.topics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_rows_scripts" on public.scripts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_rows_videos" on public.videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_rows_uploads" on public.uploads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_rows_logs" on public.logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Phase 1: single-channel mode
-- One connected YouTube channel for the whole app. Accessed only via the
-- service-role key on the server (RLS-enabled, no public policies).
-- The singleton `id boolean` + check keeps exactly one row.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.youtube_connection (
  id            boolean primary key default true,
  channel_id    text,
  channel_title text,
  access_token  text not null,
  refresh_token text not null,
  scope         text not null,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now(),
  constraint singleton check (id)
);
alter table public.youtube_connection enable row level security;
