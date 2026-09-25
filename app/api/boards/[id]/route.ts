import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import {
  BOARDS_MISSING_MESSAGE, BOARD_LIST_COLUMNS, isMissingTableError, isSceneTooLarge, sceneByteSize, sceneTooLargeMessage,
} from '@/lib/boardScene';

function fail(error: { code?: string; message: string }, status = 500) {
  if (isMissingTableError(error)) {
    return NextResponse.json({ error: BOARDS_MISSING_MESSAGE, code: 'boards_table_missing' }, { status: 503 });
  }
  return NextResponse.json({ error: error.message }, { status });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  const { data, error } = await db.from('boards').select(`${BOARD_LIST_COLUMNS},scene`)
    .eq('user_id', USER_ID).eq('id', id).single();
  if (error) return fail(error, 404);
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

// Patchable: title, scene, status. No hard delete, archive via status.
// The response leaves the scene out (the client already has it) so autosave
// does not echo megabytes back.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // Host request limit is about 4.5 MB, so anything near it is refused with a
  // readable message rather than a generic host error.
  if (body.scene !== undefined && isSceneTooLarge(body.scene)) {
    return NextResponse.json({ error: sceneTooLargeMessage(sceneByteSize(body.scene)) }, { status: 413 });
  }
  if (body.status !== undefined && body.status !== 'active' && body.status !== 'archived') {
    return NextResponse.json({ error: 'status must be active or archived' }, { status: 400 });
  }

  const db = serviceClient();
  const { data: current, error: curErr } = await db.from('boards').select('id,updated_at')
    .eq('user_id', USER_ID).eq('id', id).single();
  if (curErr) return fail(curErr, 404);

  // Concurrent-edit guard, same as SOPs/Skills.
  if (typeof body.updated_at === 'string' && body.updated_at !== current.updated_at) {
    return NextResponse.json({ error: 'changed elsewhere, reload' }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (body.scene !== undefined) patch.scene = body.scene;
  if (typeof body.status === 'string') patch.status = body.status;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await db.from('boards').update(patch).eq('id', current.id).select(BOARD_LIST_COLUMNS).single();
  if (error) return fail(error);
  return NextResponse.json(data);
}
