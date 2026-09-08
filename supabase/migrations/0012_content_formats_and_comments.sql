-- Splits the Media Tracker into content formats, gives every piece a place to
-- hold its real spoken transcript plus two different links (the working video
-- file vs. the live public post), and adds a comment thread per piece.
--
-- Why: the board was one flat list of 34 mixed pieces (long-form scripts, ad
-- scripts, VSLs, reels) with no way to look at just one format, and no way to
-- review a finished video inside the tracker. The comment thread is the
-- review loop -- notes left on a piece become the brief that gets handed to
-- the reel-editor / reel-cutter skills for the next edit pass.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo). Then run
--   node --env-file=.env.local scripts/seed-sean-reel-pieces.mjs
-- to import the 10 Sean podcast reels.
alter table content_pieces
  add column format text
    check (format in ('long_form', 'short_form', 'lts', 'carousel', 'ad', 'vsl')),
  -- Nullable on purpose: a brand new card typed into a column has no format
  -- yet, and the 34 imported pieces that predate this column get theirs from
  -- the backfill below rather than a NOT NULL default that would silently
  -- mislabel them.
  add column transcript text,
  -- The words actually spoken in the finished video. Distinct from `script`,
  -- which is what was written beforehand. Left blank for anything that has no
  -- recorded video yet.
  add column video_link text,
  -- The working video file (a Google Drive /preview URL for LTS pieces, so it
  -- renders as an embedded player in the detail view).
  add column posted_link text;
  -- The live public post (Instagram, etc), filled in only once it's out.

create index content_pieces_user_format_idx on content_pieces (user_id, format);

-- Backfill format on the pre-existing pieces from the title prefix each one
-- was already named with (LF / SF / AD / VSL / Reel).
update content_pieces set format = 'long_form'  where format is null and title like 'LF %';
update content_pieces set format = 'short_form' where format is null and title like 'SF %';
update content_pieces set format = 'ad'         where format is null and title like 'AD %';
update content_pieces set format = 'vsl'        where format is null and title like 'VSL %';
update content_pieces set format = 'lts'        where format is null and title like 'Reel %';

-- The four remaining pieces carry no prefix, just a full YouTube-style title
-- ("Why is your lead gen profitability dropping? (Positioning)"). They're all
-- platform = {youtube} and read as video topics, not ad or short-form hooks,
-- so they land in long_form alongside LF 1-8.
update content_pieces set format = 'long_form'
  where format is null and 'youtube' = any (platform);

-- Review notes left on a piece. "Needs re-edit" is NOT stored as a column on
-- content_pieces -- it's derived from whether any row here is still
-- unresolved, so the badge can never drift out of sync with the comments it
-- is supposed to be reporting.
create table content_comments (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references content_pieces(id) on delete cascade,
  -- Free text, same convention as tasks.owner: 'brendan' today, but an agent
  -- posting its own note back onto a piece shouldn't need a migration.
  author text not null default 'brendan',
  body text not null,
  -- The point in the video the note refers to, if it refers to one at all.
  video_timestamp_seconds numeric,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index content_comments_piece_id_idx on content_comments (piece_id, created_at);

-- RLS deny-all: no policies. Server routes use the service role key, which
-- bypasses RLS (matches every other table in this project).
alter table content_comments enable row level security;
