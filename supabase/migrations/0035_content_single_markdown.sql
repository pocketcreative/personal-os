-- Fix 2 of Brendan's Phase 1 CMS design corrections (2026-09-30): the same
-- repeated mistake he's flagged before -- template content stored/edited as
-- an array of separate sections (one textarea per section) instead of one
-- continuous markdown document, matching how the real Notion pages actually
-- read. Collapses content_templates.sections (jsonb array) and
-- content_items.body (jsonb map) down to a single markdown string each,
-- with the section structure expressed as `## <heading>` lines WITHIN that
-- one string, not as separate stored fields.
--
-- content_items is empty (0 rows, confirmed via direct query before writing
-- this migration) so body -> body_md needs no data migration, just a column
-- swap. content_templates has 5 real seeded rows that DO need to keep their
-- content, so this flattens each row's sections array into
-- "## <label>\n<default_content>" blocks joined by blank lines, in their
-- existing order -- exactly the shape specified in the task brief, done in
-- SQL so the real seeded text is preserved byte for byte rather than
-- retyped by hand.

alter table content_templates add column template_md text;

update content_templates ct
set template_md = sub.combined
from (
  select t.id, string_agg('## ' || (elem ->> 'label') || E'\n' || (elem ->> 'default_content'), E'\n\n' order by ord) as combined
  from content_templates t, jsonb_array_elements(t.sections) with ordinality as e(elem, ord)
  group by t.id
) sub
where ct.id = sub.id;

alter table content_templates alter column template_md set not null;
alter table content_templates alter column template_md set default '';
alter table content_templates drop column sections;

alter table content_items add column body_md text not null default '';
alter table content_items drop column body;
