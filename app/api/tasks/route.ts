import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? 'open';
  const db = serviceClient();
  let q = db.from('tasks')
    .select('*, timer_sessions(id, started_at, ended_at)')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(100000 + (Date.now() % 100000)); // unique limit busts PostgREST edge cache
  if (status === 'done') q = q.not('completed_at', 'is', null);
  else if (status === 'open') q = q.is('completed_at', null);
  // status === 'all': no filter — used by the new Task Dashboard, which
  // keeps completed tasks visible (sorted last) rather than hiding them.
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const withFlattenedTimer = (data ?? []).map((t) => {
    const sessions = (t.timer_sessions ?? []) as { id: string; started_at: string; ended_at: string | null }[];
    const openSession = sessions.find((s) => s.ended_at === null) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop it from the spread
    const { timer_sessions: _drop, ...rest } = t;
    return {
      ...rest,
      active_timer: openSession ? { id: openSession.id, started_at: openSession.started_at } : null,
      // Defensive fallback for agent_tags/task_type: undefined until
      // migration 0017 is applied on the live DB, real values after.
      agent_tags: t.agent_tags ?? [],
      task_type: t.task_type ?? 'single',
      // Same defensive fallback for decisions_log until migration 0021 lands.
      decisions_log: t.decisions_log ?? null,
    };
  });
  return NextResponse.json(withFlattenedTimer, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // typeof check first: a non-string title (number/object/array) has no
  // .trim() and would otherwise throw an uncaught TypeError -> generic 500
  // instead of a clean 400.
  if (typeof body?.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const db = serviceClient();
  const insertRow: Record<string, unknown> = {
    user_id: USER_ID,
    title: body.title.trim(),
    description: body.description ?? null,
    key: body.key ?? false,
    category: body.category ?? 'personal',
    status: body.status ?? 'not_started',
    time_estimate_min: body.time_estimate_min ?? null,
    tags: body.tags ?? [],
    due_date: body.due_date ?? null,
    owner: body.owner ?? '',
    needs_input: body.needs_input ?? false,
    input_note: body.input_note ?? null,
  };
  // Only sent when the caller actually provides them, so a plain "+ Add
  // task" title-only create keeps working unchanged whether or not
  // migration 0017 (agent_tags/task_type) has landed on the live DB yet.
  if (body.agent_tags !== undefined) insertRow.agent_tags = body.agent_tags;
  if (body.task_type !== undefined) insertRow.task_type = body.task_type;
  if (body.decisions_log !== undefined) insertRow.decisions_log = body.decisions_log;
  const { data, error } = await db.from('tasks').insert(insertRow).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ...data, agent_tags: data.agent_tags ?? [], task_type: data.task_type ?? 'single',
    decisions_log: data.decisions_log ?? null,
  }, { status: 201 });
}
