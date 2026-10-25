-- "Submit" for a scorecard day: set when Brendan finishes ticking for the day.
-- The reminder cron stays quiet once today is submitted; Edit clears it again.
alter table scorecard_days add column if not exists submitted_at timestamptz;
