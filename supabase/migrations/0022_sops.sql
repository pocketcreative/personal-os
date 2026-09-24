-- Phase 2, Part B: SOPs. Human-facing process documents, distinct from
-- Skills (which are the verbatim SKILL.md files for agents, see 0020).
-- An SOP is written for a person: Title / Date & Version / Goal /
-- Principles / Steps / Example / Checklist, downloadable as MD. It can
-- optionally point at the Skill it's based on, but many SOPs have no
-- Skill at all (e.g. filming/camera setup is a human-only process).
--
-- Starts EMPTY on purpose (Brendan's own instruction) -- no seed rows here.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

create table sops (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  version text not null default '1.0',
  version_date date not null default current_date,
  goal text not null default '',
  principles text not null default '',
  steps text not null default '',
  -- Example is deliberately nullable/blank-friendly: the UI shows an empty
  -- Example section as a placeholder to fill in later, but the downloaded
  -- MD omits the heading entirely when blank so the exported file still
  -- looks finished (Q9).
  example text,
  checklist text not null default '',
  -- Brendan's real 8-system Authority Agent Program framework. Optional --
  -- some SOPs (e.g. filming setup) don't map to any system, left blank
  -- rather than forced into one.
  systems text[] not null default '{}',
  -- One optional Skill this SOP is based on (Q6: single nullable column,
  -- not a join table -- if an SOP ever truly needs more than one, that's
  -- the trigger to revisit this, not before).
  skill_id uuid references skills(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sops_systems_valid check (
    systems <@ array['Strategy','Differentiation','Interest','Trust','Pre Frame','Revival','Data','Team']::text[]
  )
);

alter table sops enable row level security;

create index sops_user_status_idx on sops (user_id, status);
create index sops_skill_id_idx on sops (skill_id);
