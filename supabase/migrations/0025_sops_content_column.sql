-- Collapses SOPs' 5 separate content fields (goal/principles/steps/example/
-- checklist) into one `content` markdown column, matching how skills.content
-- already works (see 0020) -- Brendan's own instruction: the SOP editor
-- should be one large text box like the Skill editor, not 7 separate
-- structured boxes. title/systems/progress/skill_id stay exactly as they
-- are, only the template body collapses.
--
-- Backfill uses the same section headers renderSopExport already writes
-- (## Goal / ## Principles / ## Steps / ## Example / ## Checklist -- Example
-- omitted when blank, matching Q9's existing convention). A row with all 5
-- fields blank (e.g. the Customer Journey placeholder row) backfills to an
-- empty string rather than a skeleton full of "_Not yet written._" text, so
-- it reads as genuinely not-started, not as spuriously "in progress."
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

alter table sops add column content text not null default '';

update sops set content = case
  when trim(goal) = '' and trim(principles) = '' and trim(steps) = ''
    and coalesce(trim(example), '') = '' and trim(checklist) = ''
  then ''
  else trim(both E'\n' from (
    '## Goal' || E'\n' || coalesce(nullif(trim(goal), ''), '_Not yet written._') || E'\n\n' ||
    '## Principles' || E'\n' || coalesce(nullif(trim(principles), ''), '_Not yet written._') || E'\n\n' ||
    '## Steps' || E'\n' || coalesce(nullif(trim(steps), ''), '_Not yet written._') || E'\n\n' ||
    case when example is not null and trim(example) <> '' then '## Example' || E'\n' || trim(example) || E'\n\n' else '' end ||
    '## Checklist' || E'\n' || coalesce(nullif(trim(checklist), ''), '_Not yet written._')
  ))
end;

alter table sops drop column goal;
alter table sops drop column principles;
alter table sops drop column steps;
alter table sops drop column example;
alter table sops drop column checklist;
