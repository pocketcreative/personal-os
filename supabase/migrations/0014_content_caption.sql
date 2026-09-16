-- Adds a caption field to content_pieces: the actual platform post copy
-- (what goes in the Instagram/TikTok/YouTube caption box), distinct from
-- `script` (what's said/filmed).
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
alter table content_pieces add column caption text;
