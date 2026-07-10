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
