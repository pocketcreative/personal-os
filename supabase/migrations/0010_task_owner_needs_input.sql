-- Unifies the Tasks board and the Agents board into one dashboard. Instead of
-- a separate live-status page for AI-owned work, every task now carries who's
-- doing it (owner) and whether it's stuck waiting on Brendan (needs_input +
-- input_note), surfaced as a small warning badge on the task row.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
alter table tasks
  add column owner text not null default 'brendan',
  add column needs_input boolean not null default false,
  add column input_note text;

-- Free text on purpose (not a fixed enum): the team roster (Brendan, named
-- collaborators like Fahad, or "ai" for Claude/a sub-agent) can grow without
-- a migration each time someone new is added.

create index tasks_needs_input_idx on tasks (user_id) where needs_input = true;
