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
