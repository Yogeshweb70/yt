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
