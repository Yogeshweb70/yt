-- AI Shorts Studio — Phase 3 (Video Generation Engine)
-- Additive only. Run after phase2.sql in the Supabase SQL editor.

-- Scene images are stored per scene, so the renderer can map them back.
alter table public.images add column if not exists scene_number int;

create index if not exists idx_images_script_kind
  on public.images(script_id, kind);
