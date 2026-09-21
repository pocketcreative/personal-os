-- `additional_footage` on content_pieces was never wired to any UI (orphaned
-- column, added in 0008_content_pieces.sql but no field on the edit modal or
-- API ever exposed it for real use). Brendan confirmed: drop it, no UI to
-- build for it.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
alter table content_pieces drop column if exists additional_footage;
