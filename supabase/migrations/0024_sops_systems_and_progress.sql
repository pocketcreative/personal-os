-- Corrects the SOP `systems` taxonomy to Brendan's real 8-pillar list, and
-- adds a `progress` field so each SOP shows Active / In Progress / Not
-- Started (Brendan's own rule, given 2026-09-24: actively running day to
-- day = active; content exists but isn't run yet = in progress; nothing
-- there yet = not started). Green / yellow / neutral in the UI.
--
-- 0022's original constraint had 'Data' and 'Team' where the real pillars
-- are 'Tracking' and 'Sales' -- corrected here. Confirmed 8: Strategy,
-- Differentiation, Trust, Interest, Pre Frame, Sales, Revival, Tracking.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

alter table sops drop constraint sops_systems_valid;
alter table sops add constraint sops_systems_valid check (
  systems <@ array['Strategy','Differentiation','Trust','Interest','Pre Frame','Sales','Revival','Tracking']::text[]
);

alter table sops add column progress text not null default 'not_started'
  check (progress in ('active', 'in_progress', 'not_started'));

create index sops_user_progress_idx on sops (user_id, progress);

-- Backfill: pilot batch, Strategy pillar import (2026-09-24). These 5 rows
-- were inserted/updated via the API ahead of this migration (systems:
-- ['Strategy'] is valid under both the old and new constraint, so that
-- part didn't need to wait). Sets progress per Brendan's rule based on how
-- the source doc actually describes each one -- safe to re-run, scoped by
-- exact title.
update sops set progress = 'active' where user_id = 'brendan' and title in ('Vision', 'Goal', 'Identity');
update sops set progress = 'in_progress' where user_id = 'brendan' and title = 'Financial Modeling';
update sops set progress = 'not_started' where user_id = 'brendan' and title = 'Customer Journey';
