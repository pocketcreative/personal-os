-- Adds a thumbnail_link field to content_pieces, mirroring raw_footage_link
-- (0008_content_pieces.sql), so Brendan has a place to store a link to a
-- content piece's thumbnail image.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
alter table content_pieces add column thumbnail_link text;
