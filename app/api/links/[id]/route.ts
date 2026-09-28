import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// Patchable: name, url, trigger_link, live_tested, sort_order, status.
// Concurrent-edit guard, same convention as Skills/SOPs/Boards.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const db = serviceClient();

  const { data: current, error: curErr } = await db.from('links').select('*')
    .eq('user_id', USER_ID).eq('id', id).single();
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 404 });

  if (typeof body.updated_at === 'string' && body.updated_at !== current.updated_at) {
    return NextResponse.json({ error: 'changed elsewhere, reload' }, { status: 409 });
  }
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'archived') {
    return NextResponse.json({ error: 'status must be active or archived' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.url === 'string') patch.url = body.url.trim() || null;
  if (typeof body.trigger_link === 'string') patch.trigger_link = body.trigger_link.trim() || null;
  if (typeof body.live_tested === 'boolean') patch.live_tested = body.live_tested;
  if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;
  if (typeof body.status === 'string') patch.status = body.status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await db.from('links').update(patch).eq('id', current.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Soft delete, same convention as Skills/SOPs/Boards: status -> 'archived',
// not a hard row delete.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();

  const { data: current, error: curErr } = await db.from('links').select('id')
    .eq('user_id', USER_ID).eq('id', id).single();
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 404 });

  const { error } = await db.from('links')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', current.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
