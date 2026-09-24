import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { SOP_SYSTEMS } from '@/lib/types';

// Same pattern as app/api/skills/[slug]/route.ts: every content save bumps
// the minor version and sets today's date (Q7). A hand-typed version (any
// non "x.y" shape) is left as-is.
function bumpVersion(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)$/);
  if (!m) return v;
  return `${m[1]}.${Number(m[2]) + 1}`;
}

const CONTENT_FIELDS = ['goal', 'principles', 'steps', 'example', 'checklist'] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  const { data, error } = await db.from('sops').select('*')
    .eq('user_id', USER_ID).eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// Patchable: title, goal/principles/steps/example/checklist (any change
// bumps version + writes audit_log), systems, skill_id, status, and a hand
// override of version. `id` is the routing key -- no slug column (kept out
// on purpose, see 0022's comment: fewer moving parts, id-based routes are
// enough for SOPs).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const db = serviceClient();

  const { data: current, error: curErr } = await db.from('sops').select('*')
    .eq('user_id', USER_ID).eq('id', id).single();
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 404 });

  // 2.2.4 concurrent-edit guard, same as Skills.
  if (typeof body.updated_at === 'string' && body.updated_at !== current.updated_at) {
    return NextResponse.json({ error: 'changed elsewhere, reload' }, { status: 409 });
  }

  if (body.systems !== undefined) {
    if (!Array.isArray(body.systems) || body.systems.some((s: unknown) => !SOP_SYSTEMS.includes(s as never))) {
      return NextResponse.json({ error: 'systems must only contain the 8 known values' }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (Array.isArray(body.systems)) patch.systems = body.systems;
  if (body.skill_id === null || typeof body.skill_id === 'string') patch.skill_id = body.skill_id;
  if (typeof body.status === 'string') patch.status = body.status;

  const contentPatch: Record<string, unknown> = {};
  let contentChanged = false;
  for (const field of CONTENT_FIELDS) {
    if (field in body) {
      const incoming = body[field];
      if (incoming !== undefined && incoming !== current[field]) {
        contentChanged = true;
      }
      contentPatch[field] = incoming;
    }
  }

  if (contentChanged) {
    // Previous content goes into audit_log before being overwritten -- no
    // separate versions table (audit_log covers rollback), same as Skills.
    const { error: auditErr } = await db.from('audit_log').insert({
      user_id: USER_ID, action: 'sop_content_update', resource_type: 'sops', resource_id: current.id,
      metadata: {
        title: current.title, previous_version: current.version,
        previous: {
          goal: current.goal, principles: current.principles, steps: current.steps,
          example: current.example, checklist: current.checklist,
        },
      },
    });
    if (auditErr) return NextResponse.json({ error: auditErr.message }, { status: 500 });
    Object.assign(patch, contentPatch);
    patch.version = typeof body.version === 'string' ? body.version : bumpVersion(current.version);
    patch.version_date = new Date().toISOString().slice(0, 10);
  } else if (typeof body.version === 'string') {
    patch.version = body.version;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await db.from('sops').update(patch).eq('id', current.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
