// H4 "nothing lost" gate for scripts/import-skills.mjs: compares every
// skills row against the real local file it was imported from, byte for
// byte. Because content is stored VERBATIM (no LLM restructuring, no
// template), the bar is simple equality -- not an LLM's opinion of whether
// anything is missing.
//
// Run right after import-skills.mjs:
//   node --env-file=.env.local scripts/check-skill-coverage.mjs
//
// Any row edited via the app's Skill detail page since import will now
// legitimately differ from the local file (that's the point of Tier A
// editing + sync, not data loss) -- this script flags that as DIVERGED,
// not FAIL, and does a secondary line-coverage check on it instead of a
// hard byte compare.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SKILLS_ROOT = path.join(process.env.HOME ?? '', '.claude', 'skills');
const SYNCED_ROOT = path.join(SKILLS_ROOT, 'synced');
const USER_ID = process.env.USER_ID ?? 'brendan';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}. Run with: node --env-file=.env.local scripts/check-skill-coverage.mjs`);
  return v;
}

function hasSkillMd(dir) {
  try { return statSync(path.join(dir, 'SKILL.md')).isFile(); } catch { return false; }
}

function resolveSkillDir(entryPath) {
  try {
    const real = statSync(entryPath);
    if (!real.isDirectory()) return null;
    return hasSkillMd(entryPath) ? entryPath : null;
  } catch { return null; }
}

/** slug -> absolute path of its SKILL.md on disk, across both top-level and synced/* locations. */
function buildSlugMap() {
  const map = new Map();
  for (const name of readdirSync(SKILLS_ROOT).filter((n) => n !== 'synced')) {
    const full = path.join(SKILLS_ROOT, name);
    if (resolveSkillDir(full)) map.set(name, path.join(full, 'SKILL.md'));
  }
  if (existsSync(SYNCED_ROOT)) {
    for (const bucket of readdirSync(SYNCED_ROOT)) {
      const bucketDir = path.join(SYNCED_ROOT, bucket);
      if (!statSync(bucketDir).isDirectory()) continue;
      for (const name of readdirSync(bucketDir)) {
        const full = path.join(bucketDir, name);
        // Top-level Tier A/vendor skills take priority if a slug somehow
        // collides (shouldn't happen -- distinct namespaces in practice).
        if (!map.has(name) && resolveSkillDir(full)) map.set(name, path.join(full, 'SKILL.md'));
      }
    }
  }
  return map;
}

function normalizedLines(text) {
  return text.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

function lineCoverageCheck(original, stored) {
  const origLines = normalizedLines(original);
  const storedSet = new Set(normalizedLines(stored));
  return origLines.filter((l) => !storedSet.has(l));
}

async function main() {
  const db = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  const { data: rows, error } = await db.from('skills').select('slug, content, status').eq('user_id', USER_ID);
  if (error) throw new Error(error.message);

  const slugMap = buildSlugMap();
  let pass = 0, diverged = 0, missingLocal = 0, fail = 0;

  for (const row of (rows ?? []).sort((a, b) => a.slug.localeCompare(b.slug))) {
    const localPath = slugMap.get(row.slug);
    if (!localPath) {
      console.log(`? ${row.slug}: no local file found (renamed/removed on disk since import?) -- skipped`);
      missingLocal++;
      continue;
    }
    const local = readFileSync(localPath, 'utf8');
    if (local === row.content) {
      console.log(`OK ${row.slug}: byte-identical`);
      pass++;
      continue;
    }
    const missing = lineCoverageCheck(local, row.content);
    if (missing.length === 0) {
      console.log(`DIVERGED ${row.slug}: not byte-identical (likely edited via app since import), but every real line of the current local file is present in the stored content`);
      diverged++;
    } else {
      console.log(`FAIL ${row.slug}: ${missing.length} line(s) from the local file are missing from the stored content:`);
      for (const l of missing.slice(0, 10)) console.log(`    - ${l}`);
      if (missing.length > 10) console.log(`    ...and ${missing.length - 10} more`);
      fail++;
    }
  }

  console.log(`\n${pass} byte-identical, ${diverged} diverged (no data lost), ${missingLocal} no local file, ${fail} FAIL.`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
