import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// `goal` and `tools` are editable from the UI (simple edit-in-place / chip
// list). `skill_name` stays patchable server-side for now (legacy label,
// superseded by real agent_skills links but not dropped -- see migration
// 0023's header comment on why the drop was deferred). `name` is
// intentionally NOT patchable: tasks link to agents by matching the agent's
// `name` string in their `agent_tags` array, so renaming an agent here
// would silently break every task's link to it (no cascade).
const PATCHABLE = new Set(['goal', 'skill_name', 'tools']);

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

// Detail view for /agents/[id]: the roster row, its linked Skills, its task
// history (every task tagged with this agent's name), and any retrospective
// rows naming it. Deliberately simple per the "no over-engineering" rule --
// numbers and a list, not a scoring dashboard.
//
// Per-task time (Q11): a task tagged with exactly one agent shows that
// task's own actual_time_min (rolled up from timer_sessions, unambiguous --
// only one agent could have done the work). A task tagged with more than
// one agent shows only THIS agent's own attributed time -- the sum of
// timer_sessions rows inserted via POST /api/tasks/[id]/agent-time with
// agent_name = this agent's name -- never the full task duration copied to
// every tagged agent, and never an even split.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();

  const { data: agent, error: agentErr } = await db.from('agents').select('*')
    .eq('id', id).eq('user_id', USER_ID).single();
  if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 404 });

  const { data: links, error: linksErr } = await db.from('agent_skills')
    .select('skills(id, slug, version)').eq('agent_id', id);
  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 });
  const skills = (links ?? [])
    .map((l) => (l as unknown as { skills: { id: string; slug: string; version: string } | null }).skills)
    .filter((s): s is { id: string; slug: string; version: string } => !!s)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  // Task history: every task carrying this agent's name in agent_tags.
  // restart_count may not exist yet (migration 0023 pending) -- fall back
  // gracefully rather than 500ing the whole detail page.
  let tasks: Record<string, unknown>[] = [];
  let hasRestartCount = true;
  {
    const withRestarts = await db.from('tasks')
      .select('id, title, status, completed_at, actual_time_min, restart_count, agent_tags')
      .eq('user_id', USER_ID).contains('agent_tags', [agent.name])
      .order('created_at', { ascending: false });
    if (!withRestarts.error) {
      tasks = withRestarts.data ?? [];
    } else {
      hasRestartCount = false;
      const withoutRestarts = await db.from('tasks')
        .select('id, title, status, completed_at, actual_time_min, agent_tags')
        .eq('user_id', USER_ID).contains('agent_tags', [agent.name])
        .order('created_at', { ascending: false });
      if (withoutRestarts.error) return NextResponse.json({ error: withoutRestarts.error.message }, { status: 500 });
      tasks = withoutRestarts.data ?? [];
    }
  }

  const taskIds = tasks.map((t) => t.id as string);
  let ownedMinutesByTask = new Map<string, number>();
  if (taskIds.length > 0) {
    const { data: sessions, error: sessionsErr } = await db.from('timer_sessions')
      .select('task_id, started_at, ended_at')
      .in('task_id', taskIds).eq('agent_name', agent.name).not('ended_at', 'is', null);
    // agent_name may not exist yet either (same migration) -- treat as "no
    // attributed sessions" rather than failing the page.
    if (!sessionsErr) {
      const sums = new Map<string, number>();
      for (const s of sessions ?? []) {
        const min = Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000);
        sums.set(s.task_id, (sums.get(s.task_id) ?? 0) + Math.max(0, min));
      }
      ownedMinutesByTask = sums;
    }
  }

  const history = tasks.map((t) => {
    const tags = (t.agent_tags as string[] | null) ?? [];
    const soleAgent = tags.length <= 1;
    const owned = ownedMinutesByTask.get(t.id as string) ?? 0;
    const timeMin = owned > 0 ? owned : (soleAgent ? ((t.actual_time_min as number) ?? 0) : 0);
    return {
      id: t.id, title: t.title, status: t.status, completed_at: t.completed_at,
      actual_time_min: timeMin,
      restart_count: hasRestartCount ? ((t.restart_count as number) ?? 0) : 0,
    };
  });

  const completed = history.filter((t) => t.status === 'completed');
  const trackedTimes = completed.map((t) => t.actual_time_min).filter((m) => m > 0).sort((a, b) => a - b);
  const medianTime = trackedTimes.length === 0 ? null
    : trackedTimes.length % 2 === 1 ? trackedTimes[(trackedTimes.length - 1) / 2]
    : Math.round((trackedTimes[trackedTimes.length / 2 - 1] + trackedTimes[trackedTimes.length / 2]) / 2);
  const totalRedos = history.reduce((sum, t) => sum + t.restart_count, 0);

  const { data: retros, error: retrosErr } = await db.from('retrospectives')
    .select('*').contains('agent_names', [agent.name]).order('created_at', { ascending: false });
  // retrospectives table may not exist yet (same migration) -- empty feed
  // rather than a 500.
  const retrospectives = retrosErr ? [] : (retros ?? []);

  return NextResponse.json({
    ...agent,
    skills,
    history,
    summary: { completed_count: completed.length, median_time_min: medianTime, total_redos: totalRedos },
    retrospectives,
  }, { headers: { 'cache-control': 'no-store' } });
}
