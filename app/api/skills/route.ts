import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// Active by default; ?status=archived to see archived rows. Skills are
// created by the import script (scripts/import-skills.mjs, which writes
// directly via the service-role client, not through this route) -- POST
// exists for completeness/testing, not because the UI has a "New Skill"
// button in v1 (2.3.6).
export async function GET(req: NextRequest) {
  const db = serviceClient();
  const status = req.nextUrl.searchParams.get('status') ?? 'active';
  const { data, error } = await db.from('skills').select('*')
    .eq('user_id', USER_ID).eq('status', status).order('slug', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
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
