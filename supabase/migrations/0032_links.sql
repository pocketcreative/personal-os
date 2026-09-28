-- Links: Brendan's main links reference (the /links page), now a real table
-- instead of the hardcoded array app/links/page.tsx started with. Plain CRUD
-- with a soft delete via `status`, same convention as boards (0027) --
-- no version/audit_log machinery, this is a small reference list, not
-- long-form content like Skills/SOPs.
--
-- sort_order keeps rows in the order Brendan set them (defaults to insertion
-- order via the seed script), so editing a row doesn't reshuffle the list.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

create table links (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'brendan',
  name text not null,
  url text,
  trigger_link text,
  live_tested boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table links enable row level security;

create index links_user_status_idx on links (user_id, status, sort_order);
