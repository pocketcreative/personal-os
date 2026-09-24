import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { readTrigger } from '@/lib/skillFile';

// Columns a list card actually needs -- everything except `content`. Fix 2:
// the old `select('*')` pulled the full verbatim content for all ~86 skills
// (1.26MB) just to render a list of cards.
const LIST_COLUMNS =
  'id,user_id,slug,version,version_date,sync_to_local,source,synced_hash,last_synced_at,status,created_at,updated_at,content';

type ListRow = { content: string; [key: string]: unknown };

// Active by default; ?status=archived to see archived rows. Skills are
// created by the import script (scripts/import-skills.mjs, which writes
// directly via the service-role client, not through this route) -- POST
// exists for completeness/testing, not because the UI has a "New Skill"
// button in v1 (2.3.6).
//
// GET returns the lightweight list shape (SkillListItem: no `content`).
// `content` is still fetched from Supabase server-side (needed to extract
// `trigger_description` via readTrigger), but is stripped before the
// response leaves this route -- that's the actual fix, since the 1.26MB
// payload was what shipped to the browser, not what Supabase returned to
// the server. Detail fetches (GET /api/skills/[slug]) still return full
// content; only the list view was the problem.
//
// ?q= runs a server-side search (Fix 2) across slug + content so the
// client never needs full content to search either. Two ILIKE queries
// (slug, content) merged in JS rather than a single PostgREST `.or()`
// filter string, which needs manual escaping for commas/parens in the
// search term -- not worth it for a search box.
export async function GET(req: NextRequest) {
  const db = serviceClient();
  const status = req.nextUrl.searchParams.get('status') ?? 'active';
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  const base = () => db.from('skills').select(LIST_COLUMNS)
    .eq('user_id', USER_ID).eq('status', status);

  let rows: ListRow[];
  if (q) {
    const [bySlug, byContent] = await Promise.all([
      base().ilike('slug', `%${q}%`),
      base().ilike('content', `%${q}%`),
    ]);
    if (bySlug.error) return NextResponse.json({ error: bySlug.error.message }, { status: 500 });
    if (byContent.error) return NextResponse.json({ error: byContent.error.message }, { status: 500 });
    const byId = new Map<string, ListRow>(
      [...(bySlug.data ?? []), ...(byContent.data ?? [])].map((r) => [r.id as string, r as ListRow]),
    );
    rows = [...byId.values()].sort((a, b) => (a.slug as string).localeCompare(b.slug as string));
  } else {
    const { data, error } = await base().order('slug', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (data ?? []) as ListRow[];
  }

  const list = rows.map(({ content, ...rest }) => ({ ...rest, trigger_description: readTrigger(content) }));
  return NextResponse.json(list, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { slug, content, source } = body as { slug?: string; content?: string; source?: string };
  if (!slug || typeof content !== 'string') {
    return NextResponse.json({ error: 'slug and content are required' }, { status: 400 });
  }
  const db = serviceClient();
  const { data, error } = await db.from('skills')
    .insert({ user_id: USER_ID, slug, content, source: source ?? 'brendan' })
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
