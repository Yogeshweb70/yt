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
