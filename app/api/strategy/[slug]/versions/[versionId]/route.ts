import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { isDocSlug } from '@/lib/strategyDocs';

// One older version's text. The version must belong to the doc in the URL.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; versionId: string }> }) {
  const { slug, versionId } = await params;
  if (!isDocSlug(slug)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const db = serviceClient();
  const { data: doc } = await db.from('strategy_docs').select('id')
    .eq('user_id', USER_ID).eq('slug', slug).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data: version } = await db.from('strategy_doc_versions').select('id, content, saved_at')
    .eq('doc_id', doc.id).eq('id', versionId).maybeSingle();
  if (!version) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(version);
}
