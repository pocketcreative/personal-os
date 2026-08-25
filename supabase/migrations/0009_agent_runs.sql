-- Live status board for the manager/sub-agent workflow: whenever Claude
-- spawns a sub-agent for a substantial task, it writes a row here and keeps
-- it updated, so Brendan can see everything currently in flight from the
-- browser instead of trying to track parallel work in one Telegram thread.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  status text not null default 'running'
    check (status in ('running', 'blocked', 'done', 'failed')),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS deny-all: no policies. Server routes use the service role key, which
-- bypasses RLS (matches every other table in this project).
alter table agent_runs enable row level security;

create index agent_runs_user_status_idx on agent_runs (user_id, status);
