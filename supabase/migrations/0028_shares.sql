-- Shares: view-only private links to one SOP or one board. Anyone holding the
-- link (the `token`) sees only that item, with no login, and nothing else in
-- the app. A link can be switched off any time (`revoked_at`) and can
-- optionally expire (`expires_at`, null = never). Tokens are 32 random bytes,
-- base64url, made server side.
--
-- `resource_id` points at sops.id or boards.id depending on `resource_type`,
-- so it has no foreign key (one column, two possible tables). The API checks
-- the item exists before creating a link.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

create table shares (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'brendan',
  resource_type text not null check (resource_type in ('sop', 'board')),
  resource_id uuid not null,
  token text not null unique,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz default now()
);

-- No policy on purpose (same as 0022/0027): only the server's service role
-- key can read or write this table.
alter table shares enable row level security;

create index shares_token_idx on shares (token);
create index shares_resource_idx on shares (resource_type, resource_id);
