import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// Live per-agent task count: OPEN tasks only (status not completed/archived)
// whose agent_tags array contains this agent's name. Computed here (not
// stored) so it can never drift out of sync with the tasks board -- same
// "derive, don't cache" approach as ContentPiece.comment_count.
//
// F2 fix (2026-09-24): this used to count every task ever tagged with an
// agent, including ones long since completed or archived, so the "live"
// count was really a lifetime count. Filtered to open statuses now.
// Defensive: restart_count (migration 0023) may not be applied to the live
// DB yet. Select it, but fall back to a query without it rather than 500ing
// this whole page if it's missing -- total_redos just reads as 0 until the
// migration lands.
async function fetchAllTasks(db: ReturnType<typeof serviceClient>) {
  const withRestarts = await db.from('tasks').select('agent_tags, status, restart_count').eq('user_id', USER_ID);
  if (!withRestarts.error) return { data: withRestarts.data, hasRestartCount: true };
  const withoutRestarts = await db.from('tasks').select('agent_tags, status').eq('user_id', USER_ID);
  return { data: withoutRestarts.data, error: withoutRestarts.error, hasRestartCount: false };
}

export async function GET() {
  const db = serviceClient();
  const [
    { data: agents, error: agentsErr },
    { data: tasks, error: tasksErr, hasRestartCount },
    { data: links, error: linksErr },
  ] = await Promise.all([
    db.from('agents').select('*').eq('user_id', USER_ID).order('created_at', { ascending: true }),
    fetchAllTasks(db),
    db.from('agent_skills').select('agent_id, skills(id, slug, version)'),
  ]);
  if (agentsErr) return NextResponse.json({ error: agentsErr.message }, { status: 500 });
  if (tasksErr) return NextResponse.json({ error: tasksErr.message }, { status: 500 });
  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 });

  const counts = new Map<string, number>();
  const redoCounts = new Map<string, number>();
  for (const t of tasks ?? []) {
    const isOpen = t.status !== 'completed' && t.status !== 'archived';
    for (const tag of (t.agent_tags ?? []) as string[]) {
      if (isOpen) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      if (hasRestartCount) {
        redoCounts.set(tag, (redoCounts.get(tag) ?? 0) + ((t as { restart_count?: number }).restart_count ?? 0));
      }
    }
  }

  const skillsByAgent = new Map<string, { id: string; slug: string; version: string }[]>();
  for (const l of links ?? []) {
    const skill = (l as unknown as { skills: { id: string; slug: string; version: string } | null }).skills;
    if (!skill) continue;
    const arr = skillsByAgent.get(l.agent_id) ?? [];
    arr.push(skill);
    skillsByAgent.set(l.agent_id, arr);
  }

  const withCounts = (agents ?? []).map((a) => ({
    ...a,
    task_count: counts.get(a.name) ?? 0,
    total_redos: redoCounts.get(a.name) ?? 0,
    skills: (skillsByAgent.get(a.id) ?? []).sort((x, y) => x.slug.localeCompare(y.slug)),
  }));
  return NextResponse.json(withCounts, { headers: { 'cache-control': 'no-store' } });
}
