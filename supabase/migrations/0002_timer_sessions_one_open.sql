-- Enforce "at most one open timer session per user" at the DB level.
-- Without this, two near-simultaneous POST /api/timers/start requests could
-- each see zero open sessions and both insert, leaving two timers running
-- concurrently — violating the app's core one-timer-max invariant. A racing
-- insert now fails with a unique-violation, which the route retries once.
create unique index timer_sessions_one_open_idx
  on timer_sessions (user_id)
  where ended_at is null;
