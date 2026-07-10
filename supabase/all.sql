-- ============ schema.sql ============
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

-- ============ phase2.sql ============
-- AI Shorts Studio — Phase 2 (AI Content Engine)
-- Additive only. Safe to run after schema.sql. Run in the Supabase SQL editor.

-- Extend existing tables (non-destructive) ---------------------------------
alter table public.topics  add column if not exists summary text;
alter table public.topics  add column if not exists category text;
alter table public.topics  add column if not exists published_at timestamptz;

alter table public.scripts add column if not exists hook text;
alter table public.scripts add column if not exists cta text;

alter table public.voices  add column if not exists language text;

-- New tables ---------------------------------------------------------------
create table if not exists public.research (
  id               uuid primary key default gen_random_uuid(),
  topic_id         uuid unique references public.topics(id) on delete cascade,
  summary          text,
  key_facts        jsonb,
  important_points jsonb,
  created_at       timestamptz not null default now()
);

create table if not exists public.scenes (
  id                 uuid primary key default gen_random_uuid(),
  script_id          uuid references public.scripts(id) on delete cascade,
  scene_number       int not null,
  duration           numeric,
  narration          text,
  visual_description text,
  camera_motion      text,
  animation          text,
  transition         text,
  image_prompt       text,
  created_at         timestamptz not null default now()
);

create table if not exists public.captions (
  id         uuid primary key default gen_random_uuid(),
  voice_id   uuid references public.voices(id) on delete cascade,
  language   text not null,
  srt        text,
  vtt        text,
  words      jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.asset_manifests (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid references public.topics(id) on delete set null,
  script_id  uuid references public.scripts(id) on delete set null,
  language   text not null,
  manifest   jsonb not null,
  status     text not null default 'ready',
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,
  status          text not null default 'pending', -- pending|running|done|failed
  payload         jsonb,
  result          jsonb,
  error           text,
  attempts        int not null default 0,
  max_attempts    int not null default 3,
  parent_id       uuid references public.jobs(id) on delete set null,
  idempotency_key text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_scenes_script on public.scenes(script_id);
create index if not exists idx_jobs_status on public.jobs(status);
create index if not exists idx_manifests_topic on public.asset_manifests(topic_id);

-- Server-role-only tables (RLS on, no public policies).
alter table public.research        enable row level security;
alter table public.scenes          enable row level security;
alter table public.captions        enable row level security;
alter table public.asset_manifests enable row level security;
alter table public.jobs            enable row level security;

-- ============ phase3.sql ============
-- AI Shorts Studio — Phase 3 (Video Generation Engine)
-- Additive only. Run after phase2.sql in the Supabase SQL editor.

-- Scene images are stored per scene, so the renderer can map them back.
alter table public.images add column if not exists scene_number int;

create index if not exists idx_images_script_kind
  on public.images(script_id, kind);

-- ============ phase4.sql ============
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

-- ============ phase5.sql ============
-- AI Shorts Studio — Phase 5 (AI Creative & Quality Optimization Engine)
-- Additive only. Run after phase4.sql in the Supabase SQL editor.

create table if not exists public.title_variants (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid references public.videos(id) on delete cascade,
  text        text not null,
  ctr         int, intent int, length_score int, readability int, uniqueness int,
  total       int,
  chosen      boolean default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.thumbnail_variants (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid references public.videos(id) on delete cascade,
  strategy    text,
  prompt      text,
  url         text not null,
  clarity     int, face_focus int, contrast int, readability int, ctr int,
  total       int,
  chosen      boolean default false,
  created_at  timestamptz not null default now()
);

-- Generic per-variant scores for hooks + descriptions.
create table if not exists public.creative_scores (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid references public.videos(id) on delete cascade,
  kind        text not null,               -- hook | description
  variant     text not null,
  score       int,
  reasons     jsonb,
  chosen      boolean default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.quality_reports (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid references public.videos(id) on delete cascade,
  viral_score   int,
  cycles        int default 0,
  hook_score    int, script_score int, caption_score int, scene_score int, voice_score int,
  report        jsonb,                      -- full Quality analysis
  winner        jsonb,                      -- selected hook/title/desc/hashtags/thumb
  created_at    timestamptz not null default now()
);

create index if not exists idx_title_variants_video on public.title_variants(video_id);
create index if not exists idx_thumb_variants_video on public.thumbnail_variants(video_id);
create index if not exists idx_creative_scores_video on public.creative_scores(video_id);
create index if not exists idx_quality_reports_video on public.quality_reports(video_id);

alter table public.title_variants     enable row level security;
alter table public.thumbnail_variants enable row level security;
alter table public.creative_scores    enable row level security;
alter table public.quality_reports    enable row level security;

-- ============ phase6.sql ============
-- AI Shorts Studio — Phase 6 (Analytics & Self-Learning Platform)
-- Additive only. Run after phase5.sql in the Supabase SQL editor.

-- Append-only daily history (Step 2).
create table if not exists public.analytics_snapshots (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid references public.videos(id) on delete cascade,
  youtube_id text,
  date       text not null,                 -- YYYY-MM-DD (UTC)
  metrics    jsonb not null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_snapshot_video_date
  on public.analytics_snapshots(video_id, date);

-- Latest flattened metrics per video (fast dashboards).
create table if not exists public.video_metrics (
  video_id           uuid primary key references public.videos(id) on delete cascade,
  youtube_id         text,
  title              text,
  category           text,
  language           text,
  published_at       timestamptz,
  views              bigint default 0,
  ctr                numeric,
  impressions        bigint,
  avg_view_pct       numeric default 0,
  avg_view_duration  numeric default 0,
  watch_minutes      numeric default 0,
  likes              bigint default 0,
  comments           bigint default 0,
  shares             bigint default 0,
  subscribers_gained bigint default 0,
  engagement_rate    numeric default 0,
  traffic_sources    jsonb,
  search_terms       jsonb,
  updated_at         timestamptz not null default now()
);

create table if not exists public.retention_reports (
  id              uuid primary key default gen_random_uuid(),
  video_id        uuid references public.videos(id) on delete cascade,
  ratios          jsonb,
  worst_index     int,
  deltas          jsonb,
  completion_rate numeric,
  date            text,
  created_at      timestamptz not null default now()
);

create table if not exists public.creative_scores_history (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid references public.videos(id) on delete cascade,
  scores     jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.learning_models (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.recommendations (
  id         uuid primary key default gen_random_uuid(),
  area       text,
  suggestion text,
  priority   text,
  applied    boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.channel_health (
  id                 uuid primary key default gen_random_uuid(),
  date               text,
  avgViews           numeric,
  avgCtr             numeric,
  avgRetention       numeric,
  avgEngagement      numeric,
  uploadConsistency  numeric,
  growthRate         numeric,
  trendingDirection  text,
  sampleSize         int,
  created_at         timestamptz not null default now()
);

create table if not exists public.performance_predictions (
  id         uuid primary key default gen_random_uuid(),
  prediction jsonb not null,
  confidence numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  period       text not null,
  date         text,
  totals       jsonb,
  top_videos   jsonb,
  worst_videos jsonb,
  summary      jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  message    text,
  meta       jsonb,
  read       boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_video_metrics_views on public.video_metrics(views desc);
create index if not exists idx_reports_period on public.reports(period, date);

alter table public.analytics_snapshots       enable row level security;
alter table public.video_metrics             enable row level security;
alter table public.retention_reports         enable row level security;
alter table public.creative_scores_history   enable row level security;
alter table public.learning_models           enable row level security;
alter table public.recommendations           enable row level security;
alter table public.channel_health            enable row level security;
alter table public.performance_predictions   enable row level security;
alter table public.reports                   enable row level security;
alter table public.notifications             enable row level security;

-- ============ phase7.sql ============
-- AI Shorts Studio — Phase 7 (Production Platform & Orchestration)
-- Additive only. Run after phase6.sql. `queue_jobs` is SEPARATE from `jobs`
-- (jobs = per-service idempotency via runStage; queue_jobs = durable orchestration).

create table if not exists public.queue_jobs (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,
  status          text not null default 'pending', -- pending|running|done|failed|dead|cancelled
  payload         jsonb default '{}',
  result          jsonb,
  error           text,
  attempts        int not null default 0,
  max_attempts    int not null default 3,
  priority        int not null default 0,           -- higher runs first
  run_after       timestamptz not null default now(),
  depends_on      jsonb not null default '[]',      -- uuid[] as json
  locked_by       text,
  locked_at       timestamptz,
  progress        int not null default 0,
  stage           text,                             -- live sub-step label for the UI
  timeout_ms      int,
  idempotency_key text unique,
  channel_id      text,                             -- multi-channel ready (nullable)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_queue_ready
  on public.queue_jobs(status, priority desc, run_after);

create table if not exists public.cost_entries (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid references public.videos(id) on delete set null,
  kind       text not null,          -- chat|image|vision|voice|storage|render|youtube
  provider   text,
  amount     numeric not null default 0,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_cost_created on public.cost_entries(created_at);

create table if not exists public.api_usage (
  provider   text not null,          -- openai|elevenlabs|youtube|news|reddit|trends
  date       text not null,          -- YYYY-MM-DD (UTC)
  units      numeric not null default 0,
  cost       numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, date)
);

create table if not exists public.system_health (
  id         uuid primary key default gen_random_uuid(),
  snapshot   jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  severity   text not null default 'warn', -- info|warn|critical
  message    text,
  meta       jsonb,
  resolved   boolean default false,
  created_at timestamptz not null default now()
);

alter table public.queue_jobs   enable row level security;
alter table public.cost_entries enable row level security;
alter table public.api_usage    enable row level security;
alter table public.system_health enable row level security;
alter table public.alerts       enable row level security;

-- ============ phase8.sql ============
-- AI Shorts Studio — Phase 8 (additive SaaS-lite: security, config, webhooks)
-- Single-channel retained. Run after phase7.sql.

-- Encrypted provider credentials (Step 5/15). `value` is AES-256-GCM ciphertext.
create table if not exists public.secrets (
  provider    text primary key,   -- openai|elevenlabs|google|cloudflare|supabase
  value       text not null,
  fingerprint text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,       -- script|prompt|scene|voice|seo|thumbnail
  name       text not null,
  content    jsonb not null,
  active      boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_templates_kind_active on public.templates(kind, active);

create table if not exists public.prompt_versions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  version     int not null,
  template    text not null,
  active      boolean default false,
  performance jsonb,
  created_at  timestamptz not null default now(),
  unique (name, version)
);

create table if not exists public.brand_settings (
  id            boolean primary key default true,
  fonts         text,
  primary_color text,
  logo_url      text,
  intro_url     text,
  outro_url     text,
  watermark_url text,
  music_url     text,
  voice_id      text,
  updated_at    timestamptz not null default now(),
  constraint brand_singleton check (id)
);

create table if not exists public.webhooks (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  events     jsonb not null default '[]',
  secret     text,
  active     boolean default true,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id         uuid primary key default gen_random_uuid(),
  webhook_id uuid references public.webhooks(id) on delete cascade,
  event      text,
  status     int,
  ok         boolean,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  action     text not null,
  actor      text default 'system',
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

alter table public.secrets            enable row level security;
alter table public.templates          enable row level security;
alter table public.prompt_versions    enable row level security;
alter table public.brand_settings     enable row level security;
alter table public.webhooks           enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.audit_logs         enable row level security;

-- ============ phase9.sql ============
-- AI Shorts Studio — Phase 9 (observability). Additive. Run after phase8.sql.

create table if not exists public.traces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,          -- e.g. job:autopilot, render, upload
  duration_ms int not null,
  ok          boolean not null default true,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_traces_name_created on public.traces(name, created_at desc);

alter table public.traces enable row level security;

