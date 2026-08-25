-- Native replacement for the Notion "Media Tracker" database, so content
-- pieces live in the same Supabase backend as everything else and can get
-- a drag-between-columns Kanban board that matches the rest of the app,
-- something Notion's embed couldn't give a good mobile experience for.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
create table content_pieces (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  visual_hook text,
  script text,
  status text not null default 'draft'
    check (status in ('draft', 'ready_to_record', 'editing', 'ready_to_post', 'scheduled')),
  platform text[] not null default '{}',
  target_post_date date,
  raw_footage_link text,
  additional_footage text,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS deny-all: no policies. Server routes use the service role key, which
-- bypasses RLS (matches every other table in this project).
alter table content_pieces enable row level security;

create index content_pieces_user_status_idx on content_pieces (user_id, status);
