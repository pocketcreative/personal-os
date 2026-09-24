-- Phase 3: Agent Depository. Extends /agents into a real performance/detail
-- view. agent_skills (0019) and its FK to skills (0020) already exist --
-- nothing to do there. This migration adds the three pieces that don't
-- exist yet: redo tracking, per-agent time attribution, and retrospectives.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

-- "Send back" on a Needs Review card increments this and appends a one-line
-- reason to the task's description -- the mechanism for tracking when an
-- agent's work gets rejected/redone (M8).
alter table tasks
  add column restart_count int not null default 0;

-- Q11: log each agent's REAL individual contribution, not a full-task-
-- duration copied to every tagged agent and not an even split. Nullable --
-- a plain manual timer session (started from the task's own timer UI) has
-- no agent attribution and stays null; only sessions inserted via
-- POST /api/tasks/[id]/agent-time carry a name here. rollupTask() sums ALL
-- sessions regardless of this column for the task-level actual_time_min
-- total, so this is purely additive metadata, never a second source of
-- truth for the task total.
alter table timer_sessions
  add column agent_name text;

-- Where future task-completion retrospectives get logged (per the standing
-- CLAUDE.md rule already added tonight). This stage only builds the table/
-- API/display -- not writing retrospective content itself.
create table retrospectives (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  task_id uuid references tasks(id) on delete set null,
  agent_names text[] not null default '{}',
  skill_id uuid references skills(id) on delete set null,
  went_wrong text,
  went_well text,
  -- A row with applied_to = 'skill' and applied_ref null means "pending
  -- approval". A rejected one is set to applied_to = 'none'.
  applied_to text check (applied_to in ('skill', 'memory', 'claude_md', 'none')),
  applied_ref text,
  created_at timestamptz not null default now()
);

alter table retrospectives enable row level security;

create index retrospectives_task_id_idx on retrospectives (task_id);
create index retrospectives_skill_id_idx on retrospectives (skill_id);
create index retrospectives_agent_names_idx on retrospectives using gin (agent_names);
