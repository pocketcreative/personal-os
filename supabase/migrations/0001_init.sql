create extension if not exists vector;

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  urgency text not null default 'this_week'
    check (urgency in ('today','this_week','this_month','someday')),
  key boolean not null default false,
  priority_score double precision not null default 0,
  rank_pinned boolean not null default false,
  time_estimate_min integer,
  actual_time_min integer not null default 0,
  tags text[] not null default '{}',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table timer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  task_id uuid not null references tasks(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  emoji text,
  sub_tasks jsonb not null default '[]',
  schedule_days int[] not null default '{0,1,2,3,4,5,6}',
  nudge_time time,
  nudge_message text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  habit_id uuid not null references habits(id) on delete cascade,
  log_date date not null,
  done_subtasks jsonb not null default '[]',
  completed boolean not null default false,
  source text not null default 'dashboard',
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create table nudge_snoozes (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  log_date date not null,
  snoozed_until timestamptz not null
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  scope text not null check (scope in ('week','month')),
  title text not null,
  completed boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  entry_date date not null,
  raw_text text not null default '',
  ai_summary text,
  mood text,
  focus text,
  created_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  week_start date not null,
  wins text, slipped text, open_loops text, follow_ups text,
  content_shipped text, health_pattern text, next_week_top3 text,
  sealed_at timestamptz,
  unique (user_id, week_start)
);

create table raw_captures (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text not null,
  raw_text text not null,
  audio_url text,
  classification jsonb,
  override jsonb,
  llm_source text,
  routed_to text,
  routed_id uuid,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_type text not null,
  source_id uuid,
  text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index on memory_chunks using ivfflat (embedding vector_cosine_ops);

-- RLS deny-all: no policies. Server routes use the service role key, which bypasses RLS.
alter table tasks enable row level security;
alter table timer_sessions enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
alter table nudge_snoozes enable row level security;
alter table goals enable row level security;
alter table journal_entries enable row level security;
alter table weekly_reviews enable row level security;
alter table raw_captures enable row level security;
alter table audit_log enable row level security;
alter table memory_chunks enable row level security;

create index tasks_open_idx on tasks (user_id, completed_at) where completed_at is null;
create index timer_sessions_task_idx on timer_sessions (task_id);
create index raw_captures_routed_idx on raw_captures (routed_id);
