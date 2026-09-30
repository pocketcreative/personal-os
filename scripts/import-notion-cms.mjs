// Phase 2 of the CMS rebuild: imports the real live cards from Brendan's
// Notion "Content Management System (Sept 2026)" (LF/LTS/SF/Ad/VSL dashboards
// + the Content Ideas / Idea Bank database) into content_items /
// content_ideas. Phase 1 (schema, UI, calendar, search) is already built.
//
// Source data was fetched live via the Notion MCP this session (real
// property values confirmed via SQL query against each data source; page
// bodies fetched per-page and cleaned of Notion markup -- <br> -> newline,
// <empty-block/> stripped, {color="..."} spans unwrapped, <mention-page>
// converted to a plain markdown link, \$ unescaped back to $). That
// pre-fetched, pre-cleaned data lives in JSON files in this repo's
// scratchpad import folder (see SOURCE_DIR below) -- this script does NOT
// call Notion itself, it only reads those files and upserts into Supabase.
//
// Idempotent: upserts on `notion_page_id` (added in migration 0036), so
// re-running never creates duplicate rows -- matches the on_conflict pattern
// already used by scripts/seed-sean-reel-pieces.mjs (there it's on
// user_id+title since content_pieces predates a stable external key; here
// Notion's own page id is a better, more stable key).
//
// Usage:
//   node --env-file=.env.local scripts/import-notion-cms.mjs --dry-run
//   node --env-file=.env.local scripts/import-notion-cms.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = '/private/tmp/claude-501/-Users-pocketcreative-Library-CloudStorage-GoogleDrive-admin-pocketcreative-sg-My-Drive-Brendan-2nd-Brain/7b904787-7417-4278-9ba3-9a87a9c4df30/scratchpad/cms_import';
const USER_ID = process.env.USER_ID ?? 'brendan';
const DRY_RUN = process.argv.includes('--dry-run');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}. Run with: node --env-file=.env.local scripts/import-notion-cms.mjs`);
  return v;
}

function readJson(file) {
  return JSON.parse(readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
}

// Real check constraints from supabase/migrations/0034_content_management_system.sql,
// confirmed against the live DB before writing this script. Any Notion
// Stage/Status value that doesn't fit here gets reported, not forced in.
const VALID_STAGE = {
  lf: ['Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled', 'Broadcast', 'LTS', 'Completed'],
  lts: ['Draft Clips', 'Selected Clips', 'Post Production', 'Scheduled'],
  sf: ['Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled'],
  ad: ['Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled'],
  vsl: ['Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled'],
};
const VALID_STATUS = {
  lf: ['not started', 'In Progress', 'To Review', 'Complete', 'Archive'],
  lts: ['In Progress', 'To Review', 'Complete', 'Archive'],
  sf: ['In Progress', 'To Review', 'Complete', 'Archive'],
  ad: ['In Progress', 'To Review', 'Complete', 'Archive'],
  vsl: ['In Progress', 'To Review', 'Complete', 'Archive'],
};

function toRow(type, item) {
  const stage = item.stage;
  const status = item.status ?? null;
  const problems = [];
  if (!VALID_STAGE[type].includes(stage)) problems.push(`invalid stage "${stage}" for type ${type}`);
  if (status !== null && !VALID_STATUS[type].includes(status)) problems.push(`invalid status "${status}" for type ${type}`);
  if (type === 'lf' && item.asset_link == null) {
    // fine, asset_link is optional even for lf
  }
  if (type !== 'lf' && item.asset_link) problems.push(`asset_link set on non-lf type ${type} (constraint forbids this)`);

  const row = {
    user_id: USER_ID,
    notion_page_id: item.notion_page_id,
    type,
    name: item.name,
    stage,
    status,
    post_date: item.post_date ?? item.due_date ?? null,
    raw_footage: item.raw_footage ?? null,
    posted_footage: item.posted_footage ?? null,
    reference_video: item.reference_video ?? null,
    asset_link: type === 'lf' ? (item.asset_link ?? null) : null,
    body_md: item.body_md ?? '',
    updated_at: new Date().toISOString(),
  };
  return { row, problems };
}

async function main() {
  const db = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  // Preflight: confirm notion_page_id actually exists before trying to upsert on it.
  const { error: preflight } = await db.from('content_items').select('notion_page_id').limit(1);
  if (preflight) {
    console.error('content_items is missing notion_page_id. Run supabase/migrations/0036_content_items_notion_page_id.sql first.');
    console.error('Postgres said:', preflight.message);
    process.exit(1);
  }

  const lf = readJson('lf_full.json');
  const lts = readJson('lts_full.json');
  const sfAd = readJson('sf_ad_full.json');
  const sf = sfAd.sf;
  const ad = sfAd.ad;
  const vsl = readJson('vsl_full.json');
  const ideas = readJson('ideas_full.json');

  const typed = [
    ...lf.map((i) => ['lf', i]),
    ...lts.map((i) => ['lts', i]),
    ...sf.map((i) => ['sf', i]),
    ...ad.map((i) => ['ad', i]),
    ...vsl.map((i) => ['vsl', i]),
  ];

  console.log(`Loaded ${lf.length} lf, ${lts.length} lts, ${sf.length} sf, ${ad.length} ad, ${vsl.length} vsl, ${ideas.length} ideas from source files.`);

  const allProblems = [];
  const rows = [];
  for (const [type, item] of typed) {
    const { row, problems } = toRow(type, item);
    if (problems.length) {
      allProblems.push({ name: item.name, type, problems });
    } else {
      rows.push(row);
    }
  }

  if (allProblems.length) {
    console.error('\nSTOPPING: found real Stage/Status values that do not fit the live check constraints. Not forcing these in.');
    for (const p of allProblems) {
      console.error(`  [${p.type}] "${p.name}": ${p.problems.join('; ')}`);
    }
    process.exit(1);
  }

  console.log(`\nAll ${rows.length} content_items rows pass validation against the real check constraints.`);

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing to Supabase. Sample row:');
    console.log(JSON.stringify(rows[0], null, 2));
    console.log(`\nWould upsert ${rows.length} content_items rows and ${ideas.length} content_ideas rows.`);
    return;
  }

  // Upsert content_items on notion_page_id.
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const { data: existing, error: readErr } = await db.from('content_items')
      .select('id').eq('notion_page_id', row.notion_page_id).maybeSingle();
    if (readErr) throw readErr;
    if (existing) {
      const { error } = await db.from('content_items').update(row).eq('id', existing.id);
      if (error) { console.error(`Update failed for "${row.name}":`, error.message); process.exit(1); }
      updated++;
    } else {
      const { error } = await db.from('content_items').insert(row);
      if (error) { console.error(`Insert failed for "${row.name}":`, error.message); process.exit(1); }
      inserted++;
    }
    console.log(`  ${existing ? 'updated' : 'inserted'}  ${row.type.padEnd(4)} ${row.stage.padEnd(16)} ${row.name}`);
  }
  console.log(`\ncontent_items: ${inserted} inserted, ${updated} updated.`);

  // Upsert content_ideas on notion_page_id.
  let ideasInserted = 0;
  let ideasUpdated = 0;
  for (const idea of ideas) {
    const row = {
      user_id: USER_ID,
      notion_page_id: idea.notion_page_id,
      idea: idea.idea,
      notes: idea.notes ?? null,
      used: !!idea.used,
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: readErr } = await db.from('content_ideas')
      .select('id').eq('notion_page_id', row.notion_page_id).maybeSingle();
    if (readErr) throw readErr;
    if (existing) {
      const { error } = await db.from('content_ideas').update(row).eq('id', existing.id);
      if (error) { console.error(`Update failed for idea "${row.idea}":`, error.message); process.exit(1); }
      ideasUpdated++;
    } else {
      const { error } = await db.from('content_ideas').insert(row);
      if (error) { console.error(`Insert failed for idea "${row.idea}":`, error.message); process.exit(1); }
      ideasInserted++;
    }
  }
  console.log(`content_ideas: ${ideasInserted} inserted, ${ideasUpdated} updated.`);

  const { data: counts, error: countErr } = await db.from('content_items').select('type').eq('user_id', USER_ID);
  if (countErr) throw countErr;
  const byType = {};
  for (const r of counts) byType[r.type] = (byType[r.type] ?? 0) + 1;
  console.log('\ncontent_items now has:', byType, `(total ${counts.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
