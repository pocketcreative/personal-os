-- Native Content Management System, Phase 1 (foundations only, no migration of
-- real Notion cards -- see the task brief for the 11 confirmed decisions this
-- implements). Replaces the Notion "Content Management System (Sept 2026)"
-- page for 5 content types -- LF, LTS, SF, Ad, VSL -- plus the Idea Bank, with
-- one real Supabase table so a single calendar query can show every type
-- together by Post Date (impossible in Notion, which has 5 separate
-- databases with no cross-database view).
--
-- Stage/Status option lists below were read directly off each live Notion
-- data source's schema (fetched 2026-09-30), not guessed from the task brief:
--   LF   Stage (8): Draft, Pre-Production, Production, Post Production,
--        Scheduled, Broadcast, LTS, Completed
--        Status (5): not started, In Progress, To Review, Complete, Archive
--   LTS  Stage (4): Draft Clips, Selected Clips, Post Production, Scheduled
--        Status (4): In Progress, To Review, Complete, Archive
--   SF/Ad/VSL  Stage (5): Draft, Pre-Production, Production, Post Production,
--        Scheduled
--        Status (4): In Progress, To Review, Complete, Archive
-- "not started" is LF-only (decision 8). No new "Posted" stage -- Stage =
-- Scheduled functionally means posted (decision 3), so nothing in the schema
-- encodes that separately.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

create table content_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'brendan',
  type text not null check (type in ('lf', 'lts', 'sf', 'ad', 'vsl')),
  name text not null,
  stage text not null,
  -- Nullable on purpose, same reasoning as content_pieces.format: a card
  -- created before Status is explicitly set shouldn't be forced into a
  -- default that might mislabel it. The API sets a sensible per-type default
  -- ('not started' for LF, 'In Progress' for everything else) on create.
  status text,
  -- Decision 2: every type gets Post Date under this one name, even though
  -- live Notion currently calls it "Due Date" on LF/Ad/VSL and "Post Date" on
  -- LTS/SF -- this system starts clean with one consistent field name.
  post_date date,
  -- LF = Drive project-folder link. LTS = the actual footage file link (one
  -- clip, not a folder). Same convention Notion already uses per-dashboard;
  -- enforced by product convention, not a DB constraint (a URL is a URL).
  raw_footage text,
  posted_footage text, -- only the real live/published URL, blank if not posted yet
  reference_video text,
  -- LF-specific (Asset Link only exists on the LF Dashboard in Notion).
  asset_link text,
  platforms text[] not null default '{}',
  caption text,
  -- Real Zernio scheduling state per platform this item is scheduled to,
  -- e.g. [{"platform":"instagram","account_id":"...","post_id":"...","status":"scheduled","scheduled_for":"..."}].
  -- Written by /api/content-items/[id] when a Post Date + platform triggers
  -- a real POST/PUT to the Zernio API (see lib/zernio.ts). Empty array = not
  -- scheduled through Zernio (yet, or by design for a YouTube-only LF piece --
  -- no Zernio YouTube account is connected as of this migration).
  zernio_post_ids jsonb not null default '[]'::jsonb,
  -- One markdown blob per template section: {"section_id": "markdown text"}.
  -- Keyed against this type's content_templates.sections (below), not a fixed
  -- set of columns, so Brendan can add/remove/rename sections without a
  -- migration every time the template changes.
  body jsonb not null default '{}'::jsonb,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint content_items_stage_per_type check (
    (type = 'lf' and stage in ('Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled', 'Broadcast', 'LTS', 'Completed'))
    or (type = 'lts' and stage in ('Draft Clips', 'Selected Clips', 'Post Production', 'Scheduled'))
    or (type in ('sf', 'ad', 'vsl') and stage in ('Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled'))
  ),
  constraint content_items_status_per_type check (
    status is null
    or (type = 'lf' and status in ('not started', 'In Progress', 'To Review', 'Complete', 'Archive'))
    or (type != 'lf' and status in ('In Progress', 'To Review', 'Complete', 'Archive'))
  ),
  constraint content_items_asset_link_lf_only check (type = 'lf' or asset_link is null)
);

alter table content_items enable row level security;
create index content_items_user_type_idx on content_items (user_id, type);
-- Powers the one unified calendar query: every type, ordered by Post Date, in
-- a single request -- no UNION across 5 tables, since this is already one
-- table with a `type` column.
create index content_items_post_date_idx on content_items (post_date) where post_date is not null;

-- Editable-in-app template per type (decision 5): Brendan can add, remove,
-- rename, and reorder sections without a code change. Section content below
-- was read directly off each live Notion default page template, not
-- summarised -- e.g. LF's real Hook section has 5 real sub-parts (Promise,
-- Proof, Problems & Impacts, Roadmap, Transition), not the 4 the task brief's
-- shorthand implied.
create table content_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null unique check (type in ('lf', 'lts', 'sf', 'ad', 'vsl')),
  -- Array of {"id": "...", "label": "...", "default_content": "..."}, in
  -- display order. `id` is the key content_items.body is keyed against --
  -- renaming a section's label never breaks existing items' saved content,
  -- only deleting/re-adding one under a new id would.
  sections jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table content_templates enable row level security;

insert into content_templates (type, sections) values
('lf', $tpl$[
  {"id": "video_vision", "label": "Video Vision", "default_content": "Problems:\nOutcomes:\nProcess:"},
  {"id": "title", "label": "Title", "default_content": "Title 1:\nTitle 2:\nTitle 3:"},
  {"id": "thumbnail_notes", "label": "Thumbnail Notes", "default_content": ""},
  {"id": "thumbnail_links", "label": "Thumbnail Links", "default_content": "Link 1:\nLink 2:\nLink 3:"},
  {"id": "hook", "label": "Hook", "default_content": "### Promise\n\n### Proof\nWe've consulted over 200 agents and worked behind the scenes with 5 millionaire agents. Agents that we partner with add an additional $35-100k in a few months with us.\n\n### Problems & Impacts\n\n### Roadmap while teasing last step\n\n### Transition into Body"},
  {"id": "body_1", "label": "Body 1", "default_content": "### What\n\n### Why\n\n### How\n\n### Transition on why the next point is equally important"},
  {"id": "cta_1", "label": "CTA 1", "default_content": "Real quick, if you're running a high ticket business above $300k in revenue, I want to help you get to $1M. In the description, you can either claim my free growth roadmap or apply to work with me and my team"},
  {"id": "body_2", "label": "Body 2", "default_content": "### What\n\n### Why\n\n### How\n\n### Transition on why the next point is equally important"},
  {"id": "cta_2", "label": "CTA 2", "default_content": "If you've been getting value from this video so far, subscribe because I try to post a video like this twice a week where I break down marketing & sales concepts so that you can use them to scale your revenue."},
  {"id": "body_3", "label": "Body 3", "default_content": "### What\n\n### Why\n\n### How\n\n### Transition on why the next point is equally important"},
  {"id": "conclusion", "label": "Conclusion", "default_content": ""}
]$tpl$::jsonb),
('lts', $tpl$[
  {"id": "clip_transcript", "label": "Clip Transcript", "default_content": ""},
  {"id": "clip_brief", "label": "Clip Brief", "default_content": ""}
]$tpl$::jsonb),
('sf', $tpl$[
  {"id": "editing_briefs", "label": "Editing Briefs", "default_content": ""},
  {"id": "hooks", "label": "Hooks", "default_content": ""},
  {"id": "body", "label": "Body", "default_content": ""},
  {"id": "cta", "label": "CTA", "default_content": ""}
]$tpl$::jsonb),
('ad', $tpl$[
  {"id": "editing_briefs", "label": "Editing Briefs", "default_content": ""},
  {"id": "hooks", "label": "Hooks", "default_content": ""},
  {"id": "body", "label": "Body", "default_content": ""},
  {"id": "cta", "label": "CTA", "default_content": ""}
]$tpl$::jsonb),
('vsl', $tpl$[
  {"id": "editing_briefs", "label": "Editing Briefs", "default_content": ""},
  {"id": "hook", "label": "Hook", "default_content": ""},
  {"id": "body", "label": "Body", "default_content": ""},
  {"id": "cta", "label": "CTA", "default_content": ""}
]$tpl$::jsonb);

-- Review thread per item, same shape/purpose as content_comments (0012) for
-- the old content_pieces tracker.
create table content_item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references content_items(id) on delete cascade,
  author text not null default 'brendan',
  body text not null,
  video_timestamp_seconds numeric,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index content_item_comments_item_id_idx on content_item_comments (item_id, created_at);
alter table content_item_comments enable row level security;

-- Idea Bank (decision 4), mirroring Notion's real "Content Ideas" schema
-- exactly (Idea / Notes / Used -- confirmed via live fetch, not guessed).
-- A separate simple table rather than a 6th content_items `type`, since an
-- idea has no Stage/Status/Post Date at all -- forcing it through the same
-- shape as the other 5 types would mean a pile of always-null columns.
create table content_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'brendan',
  idea text not null,
  notes text,
  used boolean not null default false,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table content_ideas enable row level security;
create index content_ideas_user_idx on content_ideas (user_id, used);

-- RLS deny-all on every table above: no policies. Server routes use the
-- service role key, which bypasses RLS (matches every other table in this
-- project).
