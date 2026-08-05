create table ideas (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  text text not null,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ideas enable row level security;
create index ideas_user_idx on ideas (user_id, created_at);
