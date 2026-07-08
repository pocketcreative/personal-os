'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import { fetchTasks, startTimer } from '@/lib/clientTasks';
import Panel from '@/components/ui/Panel';

export default function SessionCard() {
  const [top, setTop] = useState<Task[]>([]);
  const [focus, setFocus] = useState('');
  const focusDirty = useRef(false);

  const load = useCallback(async () => {
    const tasks = await fetchTasks('open');
    setTop(
      tasks
        .filter((t) => t.key || t.urgency === 'today')
        .sort((a, b) => Number(b.key) - Number(a.key) || b.priority_score - a.priority_score)
        .slice(0, 3),
    );
    const res = await fetch('/api/focus').catch((e) => { console.error(e); return null; });
    if (res?.ok && !focusDirty.current) setFocus((await res.json()).focus);
  }, []);

  useEffect(() => {
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
