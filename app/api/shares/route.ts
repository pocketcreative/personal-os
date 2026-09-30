import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { isMissingTableError } from '@/lib/boardScene';
import {
  SHARES_MISSING_MESSAGE, SHARES_SKILL_MISSING_MESSAGE, SHARE_COLUMNS, generateToken, hashPassword, isShareResource, isUuid, parseExpiry, withStatus,
  type ShareRow,
} from '@/lib/shares';

function fail(error: { code?: string; message: string }, status = 500) {
  if (isMissingTableError(error)) {
    return NextResponse.json({ error: SHARES_MISSING_MESSAGE, code: 'shares_table_missing' }, { status: 503 });
  }
  return NextResponse.json({ error: error.message }, { status });
}

const TABLE = { sop: 'sops', board: 'boards', skill: 'skills' } as const;

// One item's links, newest first. 'cms' has no resource_id (it shares the
// whole Content Management System, not one row), so resource_id is required
// for every other kind but ignored/omitted for 'cms'.
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('resource_type');
  const id = req.nextUrl.searchParams.get('resource_id');
  if (!isShareResource(type) || (type !== 'cms' && !isUuid(id))) {
    return NextResponse.json({ error: 'resource_type and resource_id are required' }, { status: 400 });
  }
  let query = serviceClient().from('shares').select(SHARE_COLUMNS)
    .eq('user_id', USER_ID).eq('resource_type', type);
  query = type === 'cms' ? query.is('resource_id', null) : query.eq('resource_id', id);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return fail(error);
  return NextResponse.json((data as ShareRow[]).map((s) => withStatus(s)), { headers: { 'cache-control': 'no-store' } });
}

// Creates a link. The item must exist and belong to the owner (skipped for
// 'cms', which isn't one row). An optional `password` protects the link;
// stored as a scrypt hash, never in plain text.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const { resource_type: type, resource_id: id, password } = body as Record<string, unknown>;
  if (!isShareResource(type) || (type !== 'cms' && !isUuid(id))) {
    return NextResponse.json({ error: 'resource_type and resource_id are required' }, { status: 400 });
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 4)) {
    return NextResponse.json({ error: 'password must be at least 4 characters' }, { status: 400 });
  }
  const expiry = parseExpiry((body as Record<string, unknown>).expires_at, new Date());
  if (!expiry.ok) return NextResponse.json({ error: 'expiry must be a future date' }, { status: 400 });

  const db = serviceClient();
  if (type !== 'cms') {
    const { data: item, error: itemErr } = await db.from(TABLE[type]).select('id')
      .eq('user_id', USER_ID).eq('id', id).maybeSingle();
    if (itemErr) return fail(itemErr);
    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data, error } = await db.from('shares')
    .insert({
      user_id: USER_ID,
      resource_type: type,
      resource_id: type === 'cms' ? null : id,
      token: generateToken(),
      expires_at: expiry.value,
      password_hash: typeof password === 'string' ? hashPassword(password) : null,
    })
    .select(SHARE_COLUMNS).single();
  // Check violation (23514) on a skill share means migration 0029 is not applied.
  if (error && type === 'skill' && error.code === '23514') {
    return NextResponse.json({ error: SHARES_SKILL_MISSING_MESSAGE, code: 'shares_skill_unsupported' }, { status: 503 });
  }
  if (error) return fail(error);
  return NextResponse.json(withStatus(data as ShareRow), { status: 201 });
}
