import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { checkContent, MAX_VERSIONS, VERSION_LIST_LIMIT, versionsToPrune } from '@/lib/strategyDocs';

// Login-gated by middleware.ts like every other /api route.
const DOC_FIELDS = 'id, slug, title, content, updated_at';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = serviceClient();
  const { data: doc, error } = await db.from('strategy_docs').select(DOC_FIELDS)
    .eq('user_id', USER_ID).eq('slug', slug).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: versions, error: vErr } = await db.from('strategy_doc_versions').select('id, saved_at')
    .eq('doc_id', doc.id).order('saved_at', { ascending: false }).limit(VERSION_LIST_LIMIT);
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  return NextResponse.json({ doc, versions: versions ?? [] });
}

// Save order matters: the old text is copied into strategy_doc_versions FIRST.
// If that insert fails, nothing changes. If the update after it fails, the doc
// still holds the old text (plus one harmless extra version row).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const check = checkContent(body.content);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const db = serviceClient();
  const { data: current, error: curErr } = await db.from('strategy_docs').select(DOC_FIELDS)
    .eq('user_id', USER_ID).eq('slug', slug).maybeSingle();
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (check.content === current.content) return NextResponse.json({ doc: current, unchanged: true });

  const { error: insErr } = await db.from('strategy_doc_versions').insert({ doc_id: current.id, content: current.content });
  if (insErr) return NextResponse.json({ error: `could not keep the old version, nothing saved: ${insErr.message}` }, { status: 500 });

  const { data: doc, error: updErr } = await db.from('strategy_docs')
    .update({ content: check.content, updated_at: new Date().toISOString() })
    .eq('id', current.id).select(DOC_FIELDS).single();
  if (updErr) return NextResponse.json({ error: `save failed, the old text is unchanged: ${updErr.message}` }, { status: 500 });

  // Keep only the newest MAX_VERSIONS. A failure here never fails the save.
  const { data: all } = await db.from('strategy_doc_versions').select('id, saved_at').eq('doc_id', current.id);
  const extra = versionsToPrune(all ?? [], MAX_VERSIONS);
  if (extra.length > 0) await db.from('strategy_doc_versions').delete().in('id', extra);

  return NextResponse.json({ doc, unchanged: false });
}
