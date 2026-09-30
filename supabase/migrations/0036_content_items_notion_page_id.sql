-- Phase 2 of the CMS rebuild: real Notion content migration. content_items
-- needs a stable key to upsert against so re-running the import script never
-- duplicates rows. Notion's own page id (32-char hex, taken from each page's
-- URL) is that key. Confirmed via direct query before writing this migration
-- that content_items has no such column yet (0034/0035 didn't add one).
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo), or run it via the
-- Supabase Management API (used for this migration, see scripts/import-notion-cms.mjs).

alter table content_items add column notion_page_id text unique;

-- Same for content_ideas, so the Idea Bank import is idempotent too.
alter table content_ideas add column notion_page_id text unique;
