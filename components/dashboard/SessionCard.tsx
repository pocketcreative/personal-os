'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import { fetchTasks, startTimer } from '@/lib/clientTasks';
import Panel from '@/components/ui/Panel';

// Tie-break among same-`key` tasks below. `priority_score` stopped being
// populated when the capture pipeline moved off the old urgency/priority_score
// model, and the AI reranker that used to fill it in is being deleted
// entirely — so there's no scoring system left to lean on, only a fixed
// rule (mirrors lib/taskSort.ts's approach for the main board). Rank
// in-progress tasks first (same "more actionable" signal taskSort.ts uses),
// then soonest due_date (no due date sorts last), then oldest created_at so
// a "today" task captured this morning isn't buried under one captured five
// minutes ago.
function compareKeyTasks(a: Task, b: Task): number {
  const inProgress = Number(b.status === 'in_progress') - Number(a.status === 'in_progress');
  if (inProgress) return inProgress;
  const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
  const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
  if (aDue !== bDue) return aDue - bDue;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export default function SessionCard() {
  const [top, setTop] = useState<Task[]>([]);
  const [focus, setFocus] = useState('');
  const focusDirty = useRef(false);

  const load = useCallback(async () => {
    const tasks = await fetchTasks('open');
    setTop(
      tasks
        .filter((t) => t.key || t.urgency === 'today')
        .sort((a, b) => Number(b.key) - Number(a.key) || compareKeyTasks(a, b))
        .slice(0, 3),
    );
    const res = await fetch('/api/focus').catch((e) => { console.error(e); return null; });
    if (res?.ok && !focusDirty.current) setFocus((await res.json()).focus);
  }, []);

  useEffect(() => {
    // Standard fetch-on-mount effect: `load` is async, so its setTop/setFocus
    // calls happen after the awaited fetches resolve, not synchronously in
    // the effect body. No data-fetching library (React Query/SWR) is used in
    // this codebase to restructure around — this pattern is used consistently
    // elsewhere for the same purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load(), setState happens post-await, not sync-in-effect
    load();
    window.addEventListener('capture:done', load);
    return () => window.removeEventListener('capture:done', load);
  }, [load]);

  async function saveFocus() {
    const res = await fetch('/api/focus', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ focus }),
    }).catch((e) => { console.error(e); return null; });
    if (!res?.ok) { console.error('focus save failed', res && (await res.text())); return; }
    // Local and server state are back in sync — clear the guard so a later
    // load() (e.g. from another tab/device, or capture:done) can pick up
    // subsequent server-side changes again instead of being blocked forever.
    focusDirty.current = false;
  }

  return (
    <Panel title="01 // Session">
      <input
        value={focus}
        onChange={(e) => { focusDirty.current = true; setFocus(e.target.value); }}
        onBlur={saveFocus}
        placeholder="Today I will…"
        className="mb-4 w-full border-b bg-transparent pb-2 text-lg outline-none"
        style={{ borderColor: 'var(--ink-2)' }}
      />
      {top.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No key tasks yet — star some, or capture with &quot;today&quot;.</p>}
      {top.map((t) => (
        <div key={t.id} className="flex items-center justify-between py-1.5 text-sm">
          <span>{t.key ? '⭐ ' : ''}{t.title}</span>
          <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>
            {t.time_estimate_min != null ? `est ${t.time_estimate_min}m` : ''}
            <button className="ml-2" onClick={() => startTimer(t.id)} title="Start timer">▶</button>
          </span>
        </div>
      ))}
    </Panel>
  );
}
