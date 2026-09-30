import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function GET() {
  const db = serviceClient();
  const { data, error } = await db.from('content_ideas').select('*').eq('user_id', USER_ID).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.idea !== 'string' || !body.idea.trim()) {
    return NextResponse.json({ error: 'idea required' }, { status: 400 });
  }
  const db = serviceClient();
  const { data, error } = await db.from('content_ideas').insert({
    user_id: USER_ID, idea: body.idea.trim(), notes: body.notes ?? null, used: body.used ?? false,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
