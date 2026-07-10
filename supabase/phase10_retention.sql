-- ============================================================================
-- Phase 10 — 1-day data retention
--
-- Goal: publish videos to YouTube, then keep only ~1 day of data in Postgres.
-- A pg_cron job purges old pipeline artifacts + logs every hour. Media itself
-- lives in R2 (not Postgres); the video lives on YouTube after upload. This
-- only trims the local DB so it stays small and fast.
--
-- NEVER purged (config / credentials / learned state): youtube_connection,
-- oauth_tokens, secrets, brand_settings, templates, prompt_versions,
-- learning_models, schedules, users, webhooks, api_quota.
--
-- Idempotent: safe to run more than once.
--
-- Requires the `pg_cron` extension. This file enables it automatically. If the
-- CREATE EXTENSION line errors, enable it once via the Dashboard instead:
--   Database -> Extensions -> search "pg_cron" -> enable, then re-run this file.
-- ============================================================================

-- Enable the scheduler extension (creates the `cron` schema). No-op if present.
create extension if not exists pg_cron;

-- Retention window. Change '1 day' here to adjust (e.g. '2 days').
create or replace function public.purge_old_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - interval '1 day';
  -- Ordered children -> parents so FK deletes never hit a RESTRICT. Anything
  -- with ON DELETE CASCADE gets cleaned up when its parent is removed, but we
  -- delete explicitly too so tables without a cascading parent are covered.
  targets text[] := array[
    -- telemetry / logs
    'logs', 'traces', 'audit_logs', 'api_usage', 'notifications',
    'webhook_deliveries', 'cost_entries', 'video_metrics',
    'analytics_snapshots', 'performance_predictions', 'recommendations',
    'quality_reports', 'retention_reports', 'creative_scores_history',
    -- queue
    'queue_jobs', 'jobs',
    -- pipeline artifacts (children first)
    'captions', 'scenes', 'voices', 'images', 'asset_manifests', 'research',
    'title_variants', 'thumbnail_variants', 'creative_scores',
    'uploads', 'videos', 'scripts', 'topics'
  ];
  t text;
begin
  foreach t in array targets loop
    begin
      -- Only touch tables that exist and actually have a created_at column.
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'created_at'
      ) then
        execute format('delete from public.%I where created_at < $1', t) using cutoff;
      end if;
    exception when others then
      -- Skip a table this run rather than aborting the whole purge; it will be
      -- retried next hour once its children have aged out.
      raise notice 'purge_old_data: skipped % (%).', t, sqlerrm;
    end;
  end loop;
end;
$$;

-- (Re)schedule the hourly purge. Unschedule any prior copy first so re-running
-- this file doesn't create duplicates.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-old-data') then
    perform cron.unschedule('purge-old-data');
  end if;
exception when others then
  null; -- no prior job / cron not ready
end $$;

select cron.schedule('purge-old-data', '0 * * * *', $$ select public.purge_old_data(); $$);

-- Run once immediately to trim whatever is already there.
select public.purge_old_data();
