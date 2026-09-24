-- Agents Registry: one row per agent ROLE (Copywriter, Developer, editor
-- variants, etc.), distinct from `agent_runs` (a live log of individual
-- sub-agent invocations) and from `tasks.agent_tags` (which tasks are
-- assigned to which role). This table is just the roster: name, which local
-- skill it maps to (a label only -- the app has no filesystem access to
-- read actual skill files), and an editable goal string. No performance
-- metrics/scoring, no historical analytics -- deliberately out of scope.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
create table agents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  skill_name text not null default '',
  goal text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS deny-all: no policies. Server routes use the service role key, which
-- bypasses RLS (matches every other table in this project).
alter table agents enable row level security;

create unique index agents_user_name_idx on agents (user_id, name);

insert into agents (user_id, name, skill_name, goal) values
  ('brendan', 'Copywriter Agent', 'ai-*-scriptwriting / email-sms-writing / humanizer',
    'Write scripts, ads, and email/SMS copy that sound like Brendan, not AI -- catch every AI-tell before delivery.'),
  ('brendan', 'Developer Agent', 'coding work on Personal OS',
    'Ship real, working features on Personal OS without breaking what already works.'),
  ('brendan', 'Long Form Editor Agent', 'long-form-editor',
    'Turn a raw long-form recording into a finished, on-brand YouTube-shape export.'),
  ('brendan', 'Short Form/Reel Editor Agent', 'reel-editor / reel-cutter / reel-extractor / reel-auditor',
    'Cut long recordings into short vertical clips that hook in the first 3 seconds and hold to the end.'),
  ('brendan', 'Motion Graphics Agent', 'pocket-motion / hyperframes / graphics-pipeline',
    'Build clean, on-brand motion graphics that survive a real QA pass, not just a self-reported "verified."'),
  ('brendan', 'Ops/Research Agent', 'GHL / Notion / lead-research / admin',
    'Handle admin, research, and GHL/Notion ops work so nothing real falls through the cracks.'),
  ('brendan', 'Brendan', 'n/a -- this is Brendan himself',
    'Everything only Brendan can actually decide or do.')
on conflict (user_id, name) do nothing;
