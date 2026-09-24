// Phase 2 Part A: one-time import of installed Claude Code skills into the
// `skills` table (migration 0020_skills_sops.sql -- must be applied first).
// Skills are stored VERBATIM: this script reads each SKILL.md's raw bytes
// and writes them as-is. No LLM, no template, no restructuring.
//
// Run:
//   node --env-file=.env.local scripts/import-skills.mjs
//   node --env-file=.env.local scripts/import-skills.mjs --dry-run
//
// Safe to re-run: a slug that's already in the table is left untouched (so
// a later run picking up a newly-installed vendor skill never clobbers an
// edit made via the app's Skill detail page). Delete the row yourself first
// if you genuinely want to re-import one from disk.
//
// Sources, per Brendan's final Q1/Q4/Q5 answers (2026-09-24):
//  - Tier A (source='brendan', sync_to_local=true): the 22 skills below,
//    hand-picked, full bidirectional sync via scripts/sync-skills.mjs.
//  - claude.ai-synced (source='claude_ai', sync_to_local=false): everything
//    under ~/.claude/skills/synced/*/*, EXCEPT the 7 Anthropic defaults
//    (docs, docx, pdf, pptx, xlsx, skill-creator, import-memory). Discovered
//    from disk, not hardcoded -- confirms the real current list rather than
//    trusting the plan doc's recollection.
//  - vendor (source='vendor', sync_to_local=false): every other installed
//    skill under ~/.claude/skills/ (addyosmani pack, hyperframes, remotion,
//    humanizer, etc.) not already claimed by Tier A or claude.ai-synced.
//    Also discovered from disk.
//
// H5: full-tree backup of every Tier A skill folder to
// ~/.claude/skill-backups/<timestamp>/ BEFORE anything is imported --
// outside ~/.claude/skills/ so Claude Code never loads the backup as a
// duplicate skill.
// C1: Tier A rows get `synced_hash` seeded to the real file's sha256 and
// `last_synced_at` set at import time. Never left null for a synced skill --
// sync-skills.mjs treats a null hash as "never seeded" and refuses to write.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, cpSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SKILLS_ROOT = path.join(process.env.HOME ?? '', '.claude', 'skills');
const SYNCED_ROOT = path.join(SKILLS_ROOT, 'synced');
const BACKUP_ROOT = path.join(process.env.HOME ?? '', '.claude', 'skill-backups');
const USER_ID = process.env.USER_ID ?? 'brendan';
const DRY_RUN = process.argv.includes('--dry-run');

const TIER_A = [
  'ai-long-form-scriptwriting', 'ai-short-form-scriptwriting', 'ai-storytelling-scriptwriting',
  'ai-youtube-title-writing', 'email-sms-writing', 'reel-pipeline', 'reel-extractor', 'reel-cutter',
  'reel-transcript-auditor', 'reel-editor', 'pocket-motion', 'pocket-motion-auditor', 'reel-auditor',
  'reel-publisher', 'long-form-editor', 'graphics-plan', 'graphics-pipeline', 'visual-cues',
  'background-music', 'capcut', 'slideshow', 'motion-graphics',
];

const ANTHROPIC_DEFAULTS = new Set(['docs', 'docx', 'pdf', 'pptx', 'xlsx', 'skill-creator', 'import-memory']);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}. Run with: node --env-file=.env.local scripts/import-skills.mjs`);
  return v;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function hasSkillMd(dir) {
  try { return statSync(path.join(dir, 'SKILL.md')).isFile(); } catch { return false; }
}

/** Resolves a ~/.claude/skills/* entry (dir or symlink) to its real path, if it has a SKILL.md. */
function resolveSkillDir(entryPath) {
  try {
    const real = statSync(entryPath); // follows symlinks
    if (!real.isDirectory()) return null;
    return hasSkillMd(entryPath) ? entryPath : null;
  } catch {
    return null;
  }
}

function discoverTopLevel() {
  const names = readdirSync(SKILLS_ROOT).filter((n) => n !== 'synced');
  const out = [];
  for (const name of names) {
    const full = path.join(SKILLS_ROOT, name);
    if (resolveSkillDir(full)) out.push({ slug: name, dir: full });
  }
  return out;
}

function discoverSynced() {
  if (!existsSync(SYNCED_ROOT)) return [];
  const out = [];
  for (const bucket of readdirSync(SYNCED_ROOT)) {
    const bucketDir = path.join(SYNCED_ROOT, bucket);
    if (!statSync(bucketDir).isDirectory()) continue;
    for (const name of readdirSync(bucketDir)) {
      const full = path.join(bucketDir, name);
      if (resolveSkillDir(full)) out.push({ slug: name, dir: full });
    }
  }
  return out;
}

async function main() {
  const db = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  const topLevel = discoverTopLevel();
  const synced = discoverSynced();

  const tierASet = new Set(TIER_A);
  const tierA = topLevel.filter((s) => tierASet.has(s.slug));
  const missingTierA = TIER_A.filter((slug) => !tierA.some((s) => s.slug === slug));
  if (missingTierA.length) {
    console.error(`ERROR: Tier A skill(s) not found on disk (with a SKILL.md): ${missingTierA.join(', ')}`);
    process.exit(1);
  }

  const claudeAi = synced.filter((s) => !ANTHROPIC_DEFAULTS.has(s.slug));
  const skippedDefaults = synced.filter((s) => ANTHROPIC_DEFAULTS.has(s.slug));

  const vendor = topLevel.filter((s) => !tierASet.has(s.slug));

  console.log(`Discovered: ${tierA.length} Tier A, ${claudeAi.length} claude.ai-synced (skipped ${skippedDefaults.length} Anthropic defaults: ${skippedDefaults.map((s) => s.slug).join(', ')}), ${vendor.length} vendor/library.`);

  // H5: full-tree backup of Tier A folders BEFORE anything else happens.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(BACKUP_ROOT, stamp);
  if (!DRY_RUN) {
    mkdirSync(backupDir, { recursive: true });
    for (const { slug, dir } of tierA) {
      cpSync(dir, path.join(backupDir, slug), { recursive: true });
    }
    const backedUpCount = readdirSync(backupDir).length;
    if (backedUpCount !== tierA.length) {
      console.error(`ERROR: backup count mismatch (expected ${tierA.length}, got ${backedUpCount}) -- aborting before any DB write.`);
      process.exit(1);
    }
    console.log(`Backed up ${backedUpCount} Tier A skill folders to ${backupDir}`);
  } else {
    console.log(`[dry-run] would back up ${tierA.length} Tier A folders to ${backupDir}`);
  }

  // Existing slugs, so a re-run never clobbers a row already imported (and
  // possibly since edited via the app).
  const { data: existingRows, error: existingErr } = await db.from('skills').select('slug').eq('user_id', USER_ID);
  if (existingErr) throw new Error(existingErr.message);
  const existingSlugs = new Set((existingRows ?? []).map((r) => r.slug));

  const plan = [
    ...tierA.map((s) => ({ ...s, source: 'brendan', sync_to_local: true })),
    ...claudeAi.map((s) => ({ ...s, source: 'claude_ai', sync_to_local: false })),
    ...vendor.map((s) => ({ ...s, source: 'vendor', sync_to_local: false })),
  ];

  let inserted = 0, skipped = 0;
  const rows = [];
  for (const item of plan) {
    if (existingSlugs.has(item.slug)) { skipped++; continue; }
    const content = readFileSync(path.join(item.dir, 'SKILL.md'), 'utf8');
    const row = {
      user_id: USER_ID, slug: item.slug, content, source: item.source, sync_to_local: item.sync_to_local,
    };
    if (item.sync_to_local) {
      row.synced_hash = sha256(content); // C1
    }
    rows.push(row);
  }

  if (DRY_RUN) {
    console.log(`[dry-run] would insert ${rows.length} rows, skip ${plan.length - rows.length} already-imported slugs.`);
    for (const r of rows) console.log(`  + ${r.slug} (${r.source}${r.sync_to_local ? ', synced' : ''})`);
    return;
  }

  if (rows.length > 0) {
    // `last_synced_at` is set from the row's own DB-assigned `updated_at`
    // in a follow-up update, not a client-side `new Date()` computed before
    // the insert -- the insert's `updated_at` default (now() on the DB
    // server) always lands slightly after any timestamp the client stamps
    // beforehand, which made the UI's "edited since last sync" check
    // (updated_at > last_synced_at) false-positive on every freshly
    // imported Tier A row.
    const { data: insertedRows, error: insertErr } = await db
      .from('skills').insert(rows).select('id, slug, sync_to_local, updated_at');
    if (insertErr) throw new Error(insertErr.message);
    inserted = insertedRows.length;

    const syncRows = insertedRows.filter((r) => r.sync_to_local);
    for (const r of syncRows) {
      const { error: updateErr } = await db.from('skills')
        .update({ last_synced_at: r.updated_at }).eq('id', r.id);
      if (updateErr) throw new Error(`Failed to backfill last_synced_at for ${r.slug}: ${updateErr.message}`);
    }
  }
  skipped = plan.length - rows.length;

  console.log(`Imported ${inserted} new skills, skipped ${skipped} already in the table.`);
  console.log('Next: node --env-file=.env.local scripts/check-skill-coverage.mjs');
}

main().catch((err) => { console.error(err); process.exit(1); });
