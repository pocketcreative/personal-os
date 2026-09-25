-- Rate limiting for the public view-only share routes. One row per caller
-- (a salted hash of their IP, never the raw IP) per fixed time window, with a
-- count of requests (`views`) and of failed token lookups (`fails`). The
-- server checks these counts before serving a share and answers 429 when a
-- caller is over the limit. The limits themselves live in lib/shareRateLimit.ts.
--
-- The app fails open: until this is applied, or if a call errors, share links
-- keep working with no limit. Safe to deploy the code before running this.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

create table share_rate_limit (
  ip_hash text not null,
  window_start timestamptz not null,
  views integer not null default 0,
  fails integer not null default 0,
  primary key (ip_hash, window_start)
);

-- No policy on purpose (same as 0022/0027/0028): only the server's service
-- role key can read or write this table.
alter table share_rate_limit enable row level security;

-- Counts one request and returns the caller's totals for this window. Also
-- clears rows older than an hour on about 2% of calls, so no cron is needed.
create or replace function share_rate_view(p_ip_hash text, p_window_start timestamptz)
returns table (view_count integer, fail_count integer)
language plpgsql
as $$
begin
  if random() < 0.02 then
    delete from share_rate_limit where window_start < now() - interval '1 hour';
  end if;
  return query
    insert into share_rate_limit as r (ip_hash, window_start, views)
    values (p_ip_hash, p_window_start, 1)
    on conflict (ip_hash, window_start) do update set views = r.views + 1
    returning r.views, r.fails;
end;
$$;

-- Counts one failed token lookup (unknown, revoked, expired or malformed).
create or replace function share_rate_fail(p_ip_hash text, p_window_start timestamptz)
returns void
language plpgsql
as $$
begin
  insert into share_rate_limit as r (ip_hash, window_start, fails)
  values (p_ip_hash, p_window_start, 1)
  on conflict (ip_hash, window_start) do update set fails = r.fails + 1;
end;
$$;

-- Only the server (service role) may call these, never the public API keys.
revoke execute on function share_rate_view(text, timestamptz) from public, anon, authenticated;
revoke execute on function share_rate_fail(text, timestamptz) from public, anon, authenticated;
grant execute on function share_rate_view(text, timestamptz) to service_role;
grant execute on function share_rate_fail(text, timestamptz) to service_role;
