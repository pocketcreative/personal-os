import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { bumpVersion, renameFrontmatterName, validateSlug } from '@/lib/skillFile';

// True rename: changes the slug and the SKILL.md `name:` line, and sets
// renamed_from so scripts/sync-skills.mjs moves the folder on the Mac.
// Only synced skills owned by Brendan can be renamed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const db = serviceClient();

  const { data: current, error: curErr } = await db.from('skills').select('*')
    .eq('user_id', USER_ID).eq('slug', slug).single();
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 404 });

  if (current.source !== 'brendan') {
    return NextResponse.json({ error: 'Only your own skills can be renamed' }, { status: 403 });
  }
  if (current.status === 'archived' || !current.sync_to_local) {
    return NextResponse.json({ error: 'This skill is not synced to the Mac, so its folder there would keep the old name. Only active synced skills can be renamed.' }, { status: 400 });
  }
  if (typeof body.updated_at !== 'string' || body.updated_at !== current.updated_at) {
    return NextResponse.json({ error: 'changed elsewhere, reload' }, { status: 409 });
  }

  const newSlug = typeof body.new_slug === 'string' ? body.new_slug : '';
  const slugErr = validateSlug(newSlug);
  if (slugErr) return NextResponse.json({ error: slugErr }, { status: 400 });
  if (newSlug === current.slug) {
    return NextResponse.json({ error: 'That is already the name' }, { status: 400 });
  }

  const { data: clash, error: clashErr } = await db.from('skills').select('id')
    .eq('user_id', USER_ID).eq('slug', newSlug).maybeSingle();
  if (clashErr) return NextResponse.json({ error: clashErr.message }, { status: 500 });
  if (clash) return NextResponse.json({ error: 'name already used' }, { status: 409 });

  if (!('renamed_from' in current)) {
    return NextResponse.json({ error: 'Run migration 0040 first' }, { status: 500 });
  }

  // Previous content goes into audit_log before the row changes, same as a
  // content edit; nothing changes if this insert fails.
  const { error: auditErr } = await db.from('audit_log').insert({
    user_id: USER_ID, action: 'skill_renamed', resource_type: 'skills', resource_id: current.id,
    metadata: { previous_slug: current.slug, new_slug: newSlug, previous_content: current.content, previous_version: current.version },
  });
  if (auditErr) return NextResponse.json({ error: auditErr.message }, { status: 500 });

  const now = new Date().toISOString();
  const { data, error } = await db.from('skills').update({
    slug: newSlug,
    content: renameFrontmatterName(current.content, newSlug),
    version: bumpVersion(current.version),
    version_date: now.slice(0, 10),
    updated_at: now,
    renamed_from: current.renamed_from ?? current.slug,
  }).eq('id', current.id).eq('updated_at', current.updated_at).select('*').maybeSingle();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'name already used' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'changed elsewhere, reload' }, { status: 409 });
  return NextResponse.json({ ...data, systems: data.systems ?? [], renamed_from: data.renamed_from ?? null });
}
