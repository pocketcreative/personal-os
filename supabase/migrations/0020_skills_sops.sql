-- Phase 2, Part A: Skills library. SOPs and retrospectives tables are NOT
-- created here (that's Part B / a later stage) -- this migration only adds
-- what the Skills library needs, plus the agent_skills FK that 0019 left
-- dangling until this table existed.
--
-- Skills are stored VERBATIM: `content` holds the exact bytes of the local
-- SKILL.md (frontmatter included). No template, no extracted fields --
-- the trigger/description text is read from the frontmatter at display
-- time (lib/skillFile.ts readTrigger), not duplicated into its own column.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

create table skills (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  slug text not null, -- the skill's folder name on disk, e.g. "long-form-editor"
  content text not null default '', -- the full SKILL.md, exactly as on disk
  version text not null default '1.0',
  version_date date not null default current_date,
  -- true only for Brendan's own "Tier A" skills (Q4), which sync bidirectionally
  -- with ~/.claude/skills/<slug>/SKILL.md via scripts/sync-skills.mjs. False for
  -- claude.ai-owned and vendor/library skills -- those are display/reference
  -- only in this app and are never written back to disk.
  sync_to_local boolean not null default false,
  -- Who actually owns this skill's canonical copy. 'brendan' = Tier A (this
  -- app can edit + sync down to disk). 'claude_ai' = one of the ~16 skills
  -- under ~/.claude/skills/synced/, claude.ai stays the real owner. 'vendor'
  -- = every other installed skill (addyosmani pack, hyperframes, remotion,
  -- humanizer, etc.) -- reference/library only. Drives the UI's sync badge
  -- ("Synced" / "Library only" / "Owned by claude.ai") since sync_to_local
  -- alone can't distinguish claude_ai from vendor (both are false).
  source text not null default 'brendan' check (source in ('brendan', 'claude_ai', 'vendor')),
  -- sha256 of the exact local file bytes at the moment they were last known
  -- to match Supabase (set at import for Tier A, and again on every
  -- successful sync). NULL means "never seeded" -- sync-skills.mjs treats a
  -- null hash as a conflict and refuses to overwrite the local file, never
  -- as "safe to overwrite" (hardening fix C1).
  synced_hash text,
  last_synced_at timestamptz,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table skills enable row level security;

create unique index skills_user_slug_idx on skills (user_id, slug);

-- The FK that 0019_agent_skills_and_tools.sql deliberately left out because
-- `skills` didn't exist yet at that point.
alter table agent_skills
  add constraint agent_skills_skill_id_fkey foreign key (skill_id) references skills(id) on delete cascade;
