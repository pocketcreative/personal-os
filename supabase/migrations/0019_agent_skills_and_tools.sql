-- Phase 3 schema groundwork: agent_skills join table + agents.tools column.
-- Groundwork only -- no UI built on this yet, no data populated into
-- agent_skills yet (there's no `skills` table to link to).
--
-- agent_skills.skill_id is a plain uuid for now, NOT a foreign key: the
-- `skills` table it should eventually reference does not exist yet. The FK
-- constraint (skill_id references skills(id) on delete cascade) will be
-- added in a later migration once that table is built.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
create table agent_skills (
  agent_id uuid not null references agents(id) on delete cascade,
  skill_id uuid not null, -- FK to skills(id) to be added once that table exists
  primary key (agent_id, skill_id)
);

alter table agents
  add column tools text[] not null default '{}';
