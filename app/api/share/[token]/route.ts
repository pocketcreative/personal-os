import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { PUBLIC_HEADERS, toSharedBoard, toSharedSkill, toSharedSop } from '@/lib/shares';
import { findActiveShare } from '@/lib/shareLookup';

// PUBLIC route (no login, see middleware.ts). Returns only the one shared
// item's minimal data. Unknown, revoked, expired and malformed tokens all get
// the identical 404 body so nothing hints which case it was.
function notFound() {
  return NextResponse.json({ error: 'not found' }, { status: 404, headers: PUBLIC_HEADERS });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await findActiveShare(token);
  if (!share) return notFound();

  const db = serviceClient();
  if (share.resource_type === 'sop') {
    const { data } = await db.from('sops').select('title,version,version_date,content').eq('id', share.resource_id).maybeSingle();
    if (!data) return notFound();
    return NextResponse.json(toSharedSop(data), { headers: PUBLIC_HEADERS });
  }
  if (share.resource_type === 'skill') {
    const { data } = await db.from('skills').select('slug,version,version_date,content').eq('id', share.resource_id).maybeSingle();
    if (!data) return notFound();
    return NextResponse.json(toSharedSkill(data), { headers: PUBLIC_HEADERS });
  }
  const { data } = await db.from('boards').select('title,scene').eq('id', share.resource_id).maybeSingle();
  if (!data) return notFound();
  return NextResponse.json(toSharedBoard(data), { headers: PUBLIC_HEADERS });
}
