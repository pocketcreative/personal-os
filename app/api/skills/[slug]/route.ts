import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { codeBlockSmartCharWarning } from '@/lib/skillFile';
import { SOP_SYSTEMS } from '@/lib/types';

// Skills are stored verbatim, so the only "smart" edit behaviour is version
// bookkeeping (Q7): every content save bumps the minor version and sets
// today's date. A hand-typed version (any non "x.y" shape) is left as-is --
// Brendan can type his own version string and it sticks.
function bumpVersion(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)$/);
  if (!m) return v;
  return `${m[1]}.${Number(m[2]) + 1}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = serviceClient();
  const { data, error } = await db.from('skills').select('*')
    .eq('user_id', USER_ID).eq('slug', slug).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ ...data, systems: data.systems ?? [] });
}

// Patchable: content (triggers version bump + audit_log write), status
// (archive/restore), version (hand override), sync_to_local, source, systems
// (any source, including vendor, since it's a tag not content).
// `slug` is never patchable -- sync-skills.mjs and the import script both
// key off it, and the local folder name it maps to doesn't rename itself.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const db = serviceClient();

  const { data: current, error: curErr } = await db.from('skills').select('*')
    .eq('user_id', USER_ID).eq('slug', slug).single();
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 404 });

  // 2.2.4 concurrent-edit guard: the caller sends back the updated_at it
  // loaded. If the row changed since (another session/tab saved first),
  // refuse rather than silently clobber -- the UI shows "changed elsewhere,
  // reload".
  if (typeof body.updated_at === 'string' && body.updated_at !== current.updated_at) {
    return NextResponse.json({ error: 'changed elsewhere, reload' }, { status: 409 });
  }

  if (body.systems !== undefined) {
    if (!Array.isArray(body.systems) || body.systems.some((s: unknown) => !SOP_SYSTEMS.includes(s as never))) {
      return NextResponse.json({ error: 'systems must only contain the 8 known values' }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (Array.isArray(body.systems)) patch.systems = body.systems;
  if (typeof body.status === 'string') patch.status = body.status;
  if (typeof body.sync_to_local === 'boolean') patch.sync_to_local = body.sync_to_local;

  let warning: string | null = null;
  const contentChanged = typeof body.content === 'string' && body.content !== current.content;
  if (contentChanged) {
    // Fix 3: vendor skills stay read-only server-side too, not just hidden
    // in the UI -- the Edit button is only ever shown for 'brendan'
    // skills, this is the backstop.
    if (current.source === 'vendor') {
      return NextResponse.json({ error: 'Vendor skills are read-only' }, { status: 403 });
    }
    // 2.2.3: previous content goes into audit_log before being overwritten
    // (no separate versions table -- audit_log covers rollback).
    const { error: auditErr } = await db.from('audit_log').insert({
      user_id: USER_ID, action: 'skill_content_update', resource_type: 'skills', resource_id: current.id,
      metadata: { slug: current.slug, previous_content: current.content, previous_version: current.version },
    });
    if (auditErr) return NextResponse.json({ error: auditErr.message }, { status: 500 });
    patch.content = body.content;
    patch.version = typeof body.version === 'string' ? body.version : bumpVersion(current.version);
    patch.version_date = new Date().toISOString().slice(0, 10);
    warning = codeBlockSmartCharWarning(body.content as string);
  } else if (typeof body.version === 'string') {
    patch.version = body.version;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await db.from('skills').update(patch).eq('id', current.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, systems: data.systems ?? [], warning });
}
