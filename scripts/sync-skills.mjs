// Phase 2 Part A (2.7): pulls Tier A skills (sync_to_local=true) from
// Supabase down to ~/.claude/skills/<slug>/SKILL.md on this machine (Mac
// Mini only, v1 -- Q3). Built to be invoked non-interactively (--apply) by
// the future nightly automation (AUTOMATIONS.md #9); this stage only builds
// the script, not the trigger.
//
// Usage:
//   node --env-file=.env.local scripts/sync-skills.mjs                  # dry run, all Tier A skills
//   node --env-file=.env.local scripts/sync-skills.mjs --apply          # writes for real
//   node --env-file=.env.local scripts/sync-skills.mjs --apply --only long-form-editor
//   node --env-file=.env.local scripts/sync-skills.mjs --adopt-local ai-youtube-title-writing
//   node --env-file=.env.local scripts/sync-skills.mjs --apply --force --only <slug>   # overwrite local, record wins
//   node --env-file=.env.local scripts/sync-skills.mjs --apply --ignore-busy --only <slug>
//
// Conflict rule (H6): if the local file's hash no longer matches the
// record's synced_hash (someone hand-edited the SKILL.md on disk since the
// last sync) AND the record has also changed, this is a real conflict --
// refuses to overwrite either side. Brendan picks a direction:
//   --adopt-local <slug>   record loses, local file's content becomes the
//                          new record content (old record content saved to
//                          audit_log first)
//   --apply --force <slug> local file loses, backed up first, then
//                          overwritten with the record's content
//
// Rollback: restore the file from
// ~/.claude/skill-backups/<timestamp>/<slug>/SKILL.md, then run
// `--adopt-local <slug>` so the record matches again. For a bad record
// edit: restore the previous content from `audit_log`
// (resource_type='skills', action='skill_content_update'), PATCH it back
// in, then sync.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SKILLS_ROOT = path.join(process.env.HOME ?? '', '.claude', 'skills');
const BACKUP_ROOT = path.join(process.env.HOME ?? '', '.claude', 'skill-backups');
const USER_ID = process.env.USER_ID ?? 'brendan';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const IGNORE_BUSY = args.includes('--ignore-busy');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const ADOPT_LOCAL = args.includes('--adopt-local') ? args[args.indexOf('--adopt-local') + 1] : null;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}. Run with: node --env-file=.env.local scripts/sync-skills.mjs`);
  return v;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function localPathFor(slug) {
  return path.join(SKILLS_ROOT, slug, 'SKILL.md');
}

function readLocal(slug) {
  const p = localPathFor(slug);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function backupLocal(slug, content, stamp) {
  const dir = path.join(BACKUP_ROOT, stamp, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf8');
}

/** Atomic write (M2): write to a temp file in the same folder, then rename over SKILL.md. */
function writeLocalAtomic(slug, content) {
  const dir = path.join(SKILLS_ROOT, slug);
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'SKILL.md');
  const tmp = path.join(dir, `.SKILL.md.sync-tmp-${process.pid}`);
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, target);
  return sha256(readFileSync(target, 'utf8')); // hash the exact bytes actually on disk, not a separately computed value
}

async function isBusy(db, skillId) {
  const { data: links, error: linkErr } = await db.from('agent_skills').select('agent_id').eq('skill_id', skillId);
  if (linkErr) throw new Error(linkErr.message);
  if (!links || links.length === 0) return null;
  const { data: agents, error: agentsErr } = await db.from('agents').select('name').in('id', links.map((l) => l.agent_id));
  if (agentsErr) throw new Error(agentsErr.message);
  const names = (agents ?? []).map((a) => a.name);
  if (names.length === 0) return null;
  const { data: tasks, error: tasksErr } = await db.from('tasks')
    .select('title, agent_tags').eq('user_id', USER_ID).eq('status', 'in_progress');
  if (tasksErr) throw new Error(tasksErr.message);
  const busyTask = (tasks ?? []).find((t) => (t.agent_tags ?? []).some((tag) => names.includes(tag)));
  return busyTask ? busyTask.title : null;
}

async function main() {
  const db = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  let query = db.from('skills').select('*').eq('user_id', USER_ID).eq('sync_to_local', true);
  if (ONLY) query = query.eq('slug', ONLY);
  if (ADOPT_LOCAL) query = query.eq('slug', ADOPT_LOCAL);
  const { data: skills, error } = await query;
  if (error) throw new Error(error.message);
  if (!skills || skills.length === 0) {
    console.log(ONLY || ADOPT_LOCAL ? `No Tier A skill matches slug "${ONLY ?? ADOPT_LOCAL}".` : 'No Tier A skills to sync.');
    return;
  }

  for (const skill of skills) {
    if (skill.status === 'archived') {
      console.log(`SKIP ${skill.slug}: archived (report only, never synced)`);
      continue;
    }

    // --force is handled once, after this loop, as a blunt override --
    // don't also run the normal conflict-checked path for the same skill.
    if (FORCE && ONLY === skill.slug && APPLY) continue;

    if (ADOPT_LOCAL) {
      const local = readLocal(skill.slug);
      if (local === null) { console.log(`SKIP ${skill.slug}: no local file to adopt`); continue; }
      const { error: auditErr } = await db.from('audit_log').insert({
        user_id: USER_ID, action: 'skill_content_update', resource_type: 'skills', resource_id: skill.id,
        metadata: { slug: skill.slug, previous_content: skill.content, previous_version: skill.version, reason: 'adopt-local' },
      });
      if (auditErr) throw new Error(auditErr.message);
      const m = skill.version.match(/^(\d+)\.(\d+)$/);
      const nextVersion = m ? `${m[1]}.${Number(m[2]) + 1}` : skill.version;
      const localHash = sha256(local);
      const { error: upErr } = await db.from('skills').update({
        content: local, version: nextVersion, version_date: new Date().toISOString().slice(0, 10),
        synced_hash: localHash, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', skill.id);
      if (upErr) throw new Error(upErr.message);
      console.log(`ADOPTED ${skill.slug}: local file's content is now the record (v${nextVersion}).`);
      continue;
    }

    // 2.5.8: refuse to write a skill with no trigger description.
    if (!/^---\r?\n[\s\S]*?description:/m.test(skill.content)) {
      console.log(`REFUSE ${skill.slug}: no trigger description in frontmatter -- fix the SKILL.md's frontmatter first.`);
      continue;
    }

    // C1: a null synced_hash means never seeded -- refuse, never treat as safe.
    if (!skill.synced_hash) {
      console.log(`REFUSE ${skill.slug}: synced_hash is null (never seeded) -- not safe to overwrite either side.`);
      continue;
    }

    if (!IGNORE_BUSY) {
      const busyTask = await isBusy(db, skill.id);
      if (busyTask) {
        console.log(`REFUSE ${skill.slug}: an agent linked to this skill has an in-progress task ("${busyTask}") -- pass --ignore-busy to override.`);
        continue;
      }
    }

    const local = readLocal(skill.slug);

    if (local === null) {
      console.log(`${APPLY ? 'CREATE' : '[dry-run] would create'} ${skill.slug}: no local folder -- ${APPLY ? 'creating and writing SKILL.md' : 'would write SKILL.md'}`);
      if (APPLY) {
        const newHash = writeLocalAtomic(skill.slug, skill.content);
        const { error: upErr } = await db.from('skills').update({ synced_hash: newHash, last_synced_at: new Date().toISOString() }).eq('id', skill.id);
        if (upErr) throw new Error(upErr.message);
      }
      continue;
    }

    const localHash = sha256(local);
    const recordChanged = skill.content !== local; // local differs from what's currently stored on disk

    if (localHash !== skill.synced_hash) {
      // Local file was hand-edited since the last sync. If the record ALSO
      // changed, that's a real conflict -- refuse either direction.
      console.log(`CONFLICT ${skill.slug}: local file hash (${localHash.slice(0, 10)}...) does not match the last-synced hash (${skill.synced_hash.slice(0, 10)}...) -- the local SKILL.md was edited outside the sync. Not touching either side.`);
      console.log(`  Resolve with: --adopt-local ${skill.slug}  (local wins, record updated)`);
      console.log(`             or: --apply --force --only ${skill.slug}  (record wins, local overwritten after backup)`);
      continue;
    }

    if (!recordChanged) {
      console.log(`OK ${skill.slug}: already in sync.`);
      continue;
    }

    console.log(`${APPLY ? 'WRITE' : '[dry-run] would write'} ${skill.slug}: record changed since last sync, local file matches the last-synced hash -- safe to write.`);
    if (APPLY) {
      backupLocal(skill.slug, local, stamp);
      const newHash = writeLocalAtomic(skill.slug, skill.content);
      const { error: upErr } = await db.from('skills').update({ synced_hash: newHash, last_synced_at: new Date().toISOString() }).eq('id', skill.id);
      if (upErr) throw new Error(upErr.message);
      console.log(`  backed up previous local file to ${path.join(BACKUP_ROOT, stamp, skill.slug, 'SKILL.md')}`);
    }
  }

  if (FORCE && ONLY && APPLY) {
    // Explicit force-overwrite path, only reached if the caller passed
    // --force alongside --apply --only: re-fetch and hard-overwrite
    // regardless of the conflict check above (H6's second resolution).
    const { data: skill, error: forceErr } = await db.from('skills').select('*').eq('user_id', USER_ID).eq('slug', ONLY).single();
    if (forceErr) throw new Error(forceErr.message);
    const local = readLocal(ONLY);
    if (local !== null) backupLocal(ONLY, local, stamp);
    const newHash = writeLocalAtomic(ONLY, skill.content);
    await db.from('skills').update({ synced_hash: newHash, last_synced_at: new Date().toISOString() }).eq('id', skill.id);
    console.log(`FORCED ${ONLY}: local file overwritten with the record's content (backed up first).`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
