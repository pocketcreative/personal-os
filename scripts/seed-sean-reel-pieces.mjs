// One-time import of the 10 Sean podcast reels (the ~/reels/sean-podcast-cam1
// project) into content_pieces as LTS pieces, so the finished videos get
// reviewed on the Media Tracker instead of over Telegram.
//
// Run AFTER supabase/migrations/0012_content_formats_and_comments.sql has been
// applied in the Supabase SQL Editor:
//   node --env-file=.env.local scripts/seed-sean-reel-pieces.mjs
//
// Safe to re-run: matches existing rows on (user_id, title) and updates them
// in place rather than inserting a second copy. Nothing else on the board is
// touched.
//
// `transcript` on each entry is the real delivered speech, reconstructed from
// the clip's cut plan (cuts/<slug>.json: raw_segments minus every splits
// range) against full_recording_words_abs.json -- not the written script, and
// not a summary.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, '..', 'seed-data', 'sean-podcast-reels.json');
const USER_ID = process.env.USER_ID ?? 'brendan';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}. Run with: node --env-file=.env.local scripts/seed-sean-reel-pieces.mjs`);
  return v;
}

async function main() {
  const db = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  const clips = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  console.log(`Read ${clips.length} clips from ${path.basename(SEED_PATH)}.`);

  // Preflight: without 0012 the insert would fail column by column with a raw
  // Postgres error. Say what's actually missing instead.
  const { error: preflight } = await db.from('content_pieces')
    .select('format,transcript,video_link,posted_link').limit(1);
  if (preflight) {
    console.error('content_pieces is missing the new columns. Paste supabase/migrations/0012_content_formats_and_comments.sql into the Supabase SQL Editor and run it first.');
    console.error('Postgres said:', preflight.message);
    process.exit(1);
  }

  const { data: existing, error: readErr } = await db.from('content_pieces')
    .select('id,title').eq('user_id', USER_ID)
    .in('title', clips.map((c) => c.title));
  if (readErr) throw readErr;
  const byTitle = new Map((existing ?? []).map((r) => [r.title, r.id]));

  let inserted = 0;
  let updated = 0;
  for (const clip of clips) {
    const row = {
      user_id: USER_ID,
      title: clip.title,
      format: clip.format,
      status: clip.status,
      // Left as an empty array on purpose -- where each of these gets posted
      // hasn't been decided, and guessing would put a wrong platform tag on
      // the card.
      platform: [],
      transcript: clip.transcript,
      video_link: clip.video_link,
      // The finished file on this machine, so whoever picks up the next edit
      // pass knows which render the comments are against.
      raw_footage_link: clip.raw_footage_link,
      sort_order: clip.sort_order,
      updated_at: new Date().toISOString(),
    };

    const id = byTitle.get(clip.title);
    if (id) {
      const { error } = await db.from('content_pieces').update(row).eq('id', id);
      if (error) { console.error(`Update failed for "${clip.title}":`, error.message); process.exit(1); }
      updated++;
    } else {
      const { error } = await db.from('content_pieces').insert(row);
      if (error) { console.error(`Insert failed for "${clip.title}":`, error.message); process.exit(1); }
      inserted++;
    }
    console.log(`  ${id ? 'updated' : 'inserted'}  ${clip.status.padEnd(14)} ${clip.title}`);
  }

  console.log(`\nDone. ${inserted} inserted, ${updated} updated.`);

  const { count, error: countErr } = await db.from('content_pieces')
    .select('id', { count: 'exact', head: true }).eq('user_id', USER_ID);
  if (countErr) throw countErr;
  console.log(`content_pieces now has ${count} rows for user_id=${USER_ID}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
