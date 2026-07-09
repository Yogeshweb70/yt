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
