-- Adds password protection to shares (all kinds) and a new 'cms' resource
-- kind for sharing the whole Content Management System (every content_items
-- row across lf/lts/sf/ad/vsl) as one link, rather than one sop/board/skill
-- row. Reuses the existing shares table/mechanism end to end (lib/shares.ts,
-- /api/shares, /api/share/[token]) per Brendan's direct instruction to build
-- on the previous share system, not a parallel one.
--
-- password_hash applies to any resource_type, not just 'cms' -- the same
-- optional field works for a password-protected SOP/board/skill link too,
-- so this is one reusable extension, not a CMS-only bolt-on.
--
-- 'cms' shares aren't tied to one row in one table (there's no single row
-- that means "the whole CMS"), so resource_id must be nullable for this kind
-- only; every other kind still requires it.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

alter table shares add column password_hash text;

alter table shares alter column resource_id drop not null;

alter table shares drop constraint shares_resource_type_check;
alter table shares add constraint shares_resource_type_check
  check (resource_type in ('sop', 'board', 'skill', 'cms'));

alter table shares add constraint shares_resource_id_required_unless_cms
  check (resource_type = 'cms' or resource_id is not null);
alter table shares add constraint shares_cms_resource_id_null
  check (resource_type != 'cms' or resource_id is null);
