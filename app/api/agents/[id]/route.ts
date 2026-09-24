import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// Only `goal` is meant to be edited from the UI per spec (simple edit-in-
// place, nothing fancy) -- skill_name is seeded and not exposed as an
// editable control, but PATCHABLE also allows it server-side in case a
// future admin need comes up, rather than a second migration just for that.
// `name` is intentionally NOT patchable: tasks link to agents by matching
// the agent's `name` string in their `agent_tags` array, so renaming an
// agent here would silently break every task's link to it (no cascade).
const PATCHABLE = new Set(['goal', 'skill_name']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  patch.updated_at = new Date().toISOString();
  const db = serviceClient();
  const { data, error } = await db.from('agents').update(patch)
    .eq('id', id).eq('user_id', USER_ID).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
