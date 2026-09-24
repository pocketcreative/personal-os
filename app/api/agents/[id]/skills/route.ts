import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// Link a Skill to an agent role from the /agents/[id] detail page. Scoped
// to real rows: verifies both the agent and the skill belong to this user
// before inserting, same defensive pattern as every other route here.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const skillId = body?.skill_id;
  if (typeof skillId !== 'string') return NextResponse.json({ error: 'skill_id required' }, { status: 400 });

  const db = serviceClient();
  const [{ data: agent, error: agentErr }, { data: skill, error: skillErr }] = await Promise.all([
    db.from('agents').select('id').eq('id', id).eq('user_id', USER_ID).single(),
    db.from('skills').select('id').eq('id', skillId).eq('user_id', USER_ID).single(),
  ]);
  if (agentErr) return NextResponse.json({ error: 'agent not found' }, { status: 404 });
  if (skillErr) return NextResponse.json({ error: 'skill not found' }, { status: 404 });

  const { error } = await db.from('agent_skills').insert({ agent_id: agent.id, skill_id: skill.id });
  // Duplicate link (already linked) is a no-op success, not an error.
  if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skillId = req.nextUrl.searchParams.get('skill_id');
  if (!skillId) return NextResponse.json({ error: 'skill_id required' }, { status: 400 });
  const db = serviceClient();
  const { error } = await db.from('agent_skills').delete().eq('agent_id', id).eq('skill_id', skillId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
