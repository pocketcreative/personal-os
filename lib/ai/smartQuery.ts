import { serviceClient, USER_ID } from '@/lib/supabase';

export type SmartQueryResult =
  | { ids: string[]; note: string }
  | { error: string };

// Extracted from app/api/tasks/smart/route.ts so the same logic can be
// reused by app/api/assistant/route.ts's question-routing path, without
// duplicating the prompt/parsing/id-filtering logic in two places.
export async function runSmartQuery(query: string): Promise<SmartQueryResult> {
  const db = serviceClient();
  const { data: tasks, error } = await db.from('tasks')
    .select('id, title, urgency, key, tags, due_date, time_estimate_min')
    .eq('user_id', USER_ID).is('completed_at', null)
    .limit(100000 + (Date.now() % 100000));
  if (error) return { error: error.message };
  if (!tasks?.length) return { ids: [], note: 'No open tasks.' };

  const list = tasks.map((t) =>
    `${t.id} | ${t.title} | ${t.urgency} | key:${t.key} | est:${t.time_estimate_min ?? '-'}m | tags:${t.tags.join(',')} | due:${t.due_date ?? '-'}`,
  ).join('\n');

  // Bare assertion here (not requireEnv, same reasoning as the rerank cron
  // in task 15): the `if (!res.ok)` check below already turns a
  // missing/invalid key into a graceful error, so a thrown/caught requireEnv
  // error would just be redundant belt-and-suspenders for the same outcome.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: 'Given the user\'s open tasks and their question, return ONLY JSON: {"ids": string[] (matching task ids, best order first), "note": string (one helpful sentence)}.',
      messages: [{ role: 'user', content: `Tasks:\n${list}\n\nQuestion: ${query}` }],
    }),
  });
  if (!res.ok) {
    console.error('smart search failed', res.status, await res.text());
    return { error: 'AI unavailable' };
  }
  const json = await res.json();
  const raw: string = json.content?.[0]?.text ?? '{}';
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const valid = new Set(tasks.map((t) => t.id));
    // Deliberate prompt-injection mitigation: task titles and the raw query
    // both flow into the prompt unsanitized. A crafted title could try to
    // manipulate the model's output, but this filter constrains the result
    // to ids that are real, already-open, already-belong-to-USER_ID tasks
    // regardless of what the model returns — worst case is a confusing note
    // or ordering, never a leaked or unauthorized id.
    return {
      ids: (parsed.ids ?? []).filter((id: string) => valid.has(id)),
      note: typeof parsed.note === 'string' ? parsed.note : '',
    };
  } catch {
    console.error('smart parse failed', raw);
    return { error: 'AI returned garbage' };
  }
}
