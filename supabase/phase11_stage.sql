-- Phase 11: live sub-step label for the dashboard pipeline panel.
-- Additive only. Adds a free-text `stage` (e.g. "Script", "Voice") that the
-- content handler updates as the pipeline advances, so the UI can show only
-- the currently-running sub-step instead of the full static chain.
alter table public.queue_jobs add column if not exists stage text;
