-- Daily Scorecard ("Kept Word"). Separate from the old habits/habit_logs tables.
-- Habits are a template; each day stores a snapshot of the list as it was that
-- day (scorecard_day_items), so editing habits never rewrites past scores.
-- RLS on, no policies: deny-all, server routes use the service role.

create table if not exists scorecard_habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists scorecard_habits_user_idx on scorecard_habits (user_id, active, sort_order);

create table if not exists scorecard_days (
  user_id    text not null,
  date       date not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists scorecard_day_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  date       date not null,
  habit_id   uuid,          -- null for a one-off item added just for that day
  name       text not null, -- copied at snapshot time
  done       boolean not null default false,
  sort_order int  not null default 0,
  foreign key (user_id, date) references scorecard_days (user_id, date) on delete cascade
);
create index if not exists scorecard_day_items_day_idx on scorecard_day_items (user_id, date);

create table if not exists scorecard_settings (
  user_id          text primary key,
  streak_threshold int not null default 80 check (streak_threshold between 1 and 100)
);

alter table scorecard_habits    enable row level security;
alter table scorecard_days      enable row level security;
alter table scorecard_day_items enable row level security;
alter table scorecard_settings  enable row level security;

-- Seed (first run only). user_id 'brendan' matches USER_ID's default.
insert into scorecard_habits (user_id, name, sort_order)
select 'brendan', v.name, v.ord
from (values
  ('Asleep by 11pm', 1),
  ('Up at 7am', 2),
  ('Deep work 8–10am on the biggest constraint, one task only', 3),
  ('No social media before 6pm', 4),
  ('No porn', 5),
  ('Tomorrow''s tasks planned tonight, each with its first step', 6)
) as v(name, ord)
where not exists (select 1 from scorecard_habits where user_id = 'brendan');

insert into scorecard_settings (user_id) values ('brendan') on conflict do nothing;
