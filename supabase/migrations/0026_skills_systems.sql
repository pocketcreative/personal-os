-- Skills get the same 8-section `systems` tag SOPs already have (0022/0024),
-- so /skills can be filtered by Strategy / Differentiation / Trust / etc.
-- Same shape as sops.systems: text[], default empty, CHECK on the 8 values.
-- Optional: a skill with no tag stays untagged.
--
-- The claude.ai sync/import scripts never touch this column (sync-skills.mjs
-- only writes content/version/hash/sync fields, import-skills.mjs only
-- inserts new rows), so tags set here survive every sync.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

alter table skills add column systems text[] not null default '{}';
alter table skills add constraint skills_systems_valid check (
  systems <@ array['Strategy','Differentiation','Trust','Interest','Pre Frame','Sales','Revival','Tracking']::text[]
);

-- Backfill (2026-09-25): one UPDATE per section, by slug. Slugs not present
-- in the skills table are harmless no-ops; every other skill stays untagged.
update skills set systems = array['Trust'] where slug in (
  'ai-long-form-scriptwriting', 'ai-short-form-scriptwriting', 'ai-storytelling-scriptwriting',
  'ai-youtube-title-writing', 'humanizer', 'long-form-editor', 'reel-extractor', 'reel-cutter',
  'reel-transcript-auditor', 'reel-editor', 'reel-auditor', 'reel-pipeline', 'reel-publisher',
  'pocket-motion', 'pocket-motion-auditor', 'graphics-pipeline', 'graphics-plan', 'visual-cues',
  'background-music', 'hyperframes-cinematic-caption', 'youtube-thumbnail', 'clip-extractor',
  'scriptwriter', 'lf-video-editor'
);
update skills set systems = array['Interest'] where slug in (
  'lead-magnet-builder', 'my-ad-copy-buddy', 'my-static-copy-buddy', 'my-script-buddy',
  'ad-recreator', 'ghl-workflow-architect'
);
update skills set systems = array['Pre Frame'] where slug in ('email-sms-writing');
update skills set systems = array['Revival'] where slug in ('weekly-reactivation-outreach', 'lead-followup-writer');
update skills set systems = array['Tracking'] where slug in ('crm-pipeline-review');
