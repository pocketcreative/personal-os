import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// Live per-agent task count: tasks whose agent_tags array contains this
// agent's name. Computed here (not stored) so it can never drift out of
// sync with the tasks board -- same "derive, don't cache" approach as
// ContentPiece.comment_count.
export async function GET() {
  const db = serviceClient();
  const [{ data: agents, error: agentsErr }, { data: tasks, error: tasksErr }] = await Promise.all([
    db.from('agents').select('*').eq('user_id', USER_ID).order('created_at', { ascending: true }),
    db.from('tasks').select('agent_tags').eq('user_id', USER_ID),
  ]);
  if (agentsErr) return NextResponse.json({ error: agentsErr.message }, { status: 500 });
  if (tasksErr) return NextResponse.json({ error: tasksErr.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const t of tasks ?? []) {
    for (const tag of (t.agent_tags ?? []) as string[]) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const withCounts = (agents ?? []).map((a) => ({ ...a, task_count: counts.get(a.name) ?? 0 }));
  return NextResponse.json(withCounts, { headers: { 'cache-control': 'no-store' } });
}
