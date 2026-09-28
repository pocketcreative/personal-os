-- Who a skill is FOR (2026-09-28): 'internal' = Brendan's own tools,
-- 'client' = built for an agent/client to run themselves, so it must never
-- hard-code Brendan's own Target Audience, Offer, Supabase or Notion access.
-- A different axis from `source` (who authored it). Drives the
-- "Skills (Internal)" / "Skills (Clients)" split on /skills.
--
-- The sync/import scripts never touch this column, so tags set here survive
-- every sync. New rows default to internal.

alter table skills add column audience text not null default 'internal'
  check (audience in ('internal', 'client'));

update skills set audience = 'client' where slug in (
  'my-ad-copy-buddy', 'my-script-buddy', 'my-static-copy-buddy',
  'revival-lead-sorting', 'revival-message-scripting', 'revival-message-deployment',
  'ghl-mcp-setup', 'official-wa-setup', 'unofficial-wa-setup', 'second-number-setup'
);
