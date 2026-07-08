import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { mergeRanks } from '@/lib/priority';
import { localDateKey } from '@/lib/dates';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = serviceClient();
  const { data: tasks, error } = await db.from('tasks')
    .select('id, title, urgency, key, due_date, created_at, priority_score, rank_pinned')
    .eq('user_id', USER_ID).is('completed_at', null)
    .limit(100000 + (Date.now() % 100000));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tasks || tasks.length < 2) return NextResponse.json({ skipped: 'too few tasks' });

  const today = localDateKey();
  const list = tasks.map((t) =>
    `${t.id} | ${t.title} | tier:${t.urgency} | key:${t.key} | due:${t.due_date ?? '-'} | created:${t.created_at.slice(0, 10)}`,
  ).join('\n');

  // Bare assertion here (not requireEnv, unlike tasks 9/10): the route-level
  // `if (!res.ok)` check below already turns a missing/invalid key into a
  // graceful `{ skipped: 'ai failed' }` 200 response, so a thrown/caught
  // requireEnv error would just be redundant belt-and-suspenders for the
  // same outcome this route already achieves via the fetch response check.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `Today is ${today}. Rank the user's open tasks: most important/urgent first. Weigh: overdue or due-soon dates, key flag, tier (today > this_week > this_month > someday), and age (old someday items decay, but flag-worthy old tasks rise). Return ONLY a JSON array of task ids in rank order.`,
      messages: [{ role: 'user', content: list }],
    }),
  });
  if (!res.ok) {
    console.error('rerank AI failed', res.status, await res.text());
    return NextResponse.json({ skipped: 'ai failed' }); // 200: cron is best-effort, tomorrow retries
  }
  const json = await res.json();
  const raw: string = json.content?.[0]?.text ?? '[]';
  let ids: string[] = [];
  try {
    ids = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
  } catch {
    console.error('rerank parse failed', raw);
    return NextResponse.json({ skipped: 'parse failed' });
  }

  const updates = mergeRanks(tasks, ids);
  for (const u of updates) {
    const { error: upErr } = await db.from('tasks')
      .update({ priority_score: u.priority_score }).eq('id', u.id).eq('user_id', USER_ID);
    if (upErr) console.error('rerank update failed', u.id, upErr.message);
  }
  return NextResponse.json({ reranked: updates.length });
}
