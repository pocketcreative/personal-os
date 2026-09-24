import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { SOP_SYSTEMS } from '@/lib/types';

// Active by default; ?status=archived to see archived rows.
export async function GET(req: NextRequest) {
  const db = serviceClient();
  const status = req.nextUrl.searchParams.get('status') ?? 'active';
  const { data, error } = await db.from('sops').select('*')
    .eq('user_id', USER_ID).eq('status', status).order('title', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

// Unlike Skills (import-only in v1), SOPs start with zero seeded rows on
// purpose (Brendan's own instruction, Q13) -- so "New SOP" has to be a real
// working POST, not a stub. Everything except title is optional; a brand
// new SOP is a blank 7-section shell the detail page fills in.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, systems, skill_id } = body as { title?: string; systems?: unknown; skill_id?: unknown };
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (systems !== undefined) {
    if (!Array.isArray(systems) || systems.some((s) => !SOP_SYSTEMS.includes(s))) {
      return NextResponse.json({ error: 'systems must only contain the 8 known values' }, { status: 400 });
    }
  }
  const db = serviceClient();
  const { data, error } = await db.from('sops')
    .insert({
      user_id: USER_ID,
      title: title.trim(),
      systems: systems ?? [],
      skill_id: typeof skill_id === 'string' ? skill_id : null,
    })
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
