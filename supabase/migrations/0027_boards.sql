-- Boards: a free Miro-like whiteboard with many boards, saved in our own
-- database. The editor is the open-source (MIT) @excalidraw/excalidraw
-- package; its scene (elements, image files, a small view-state subset) is
-- stored as JSON in `scene`. No hard delete: a board is archived via
-- `status`, same as SOPs (0022).
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

create table boards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'brendan',
  title text not null default 'Untitled board',
  scene jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table boards enable row level security;

create index boards_user_status_idx on boards (user_id, status);
