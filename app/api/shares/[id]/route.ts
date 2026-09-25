import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/boardScene';
import { SHARES_MISSING_MESSAGE, SHARE_COLUMNS, isUuid, withStatus, type ShareRow } from '@/lib/shares';

// Turn a link off ({ revoked: true }) or back on ({ revoked: false }).
// No hard delete: the row stays so an off link keeps returning "not found".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (!isUuid(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (typeof body.revoked !== 'boolean') {
    return NextResponse.json({ error: 'revoked must be true or false' }, { status: 400 });
  }
  const { data, error } = await serviceClient().from('shares')
    .update({ revoked_at: body.revoked ? new Date().toISOString() : null })
    .eq('user_id', USER_ID).eq('id', id).select(SHARE_COLUMNS).maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: SHARES_MISSING_MESSAGE, code: 'shares_table_missing' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(withStatus(data as ShareRow));
}
