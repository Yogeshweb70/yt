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
