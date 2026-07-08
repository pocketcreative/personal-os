'use client';
import { useCallback, useEffect, useState } from 'react';

interface ActiveTimer {
  id: string;
  task_id: string;
  started_at: string;
  tasks: { title: string; time_estimate_min: number | null; actual_time_min: number };
}

export default function TimerStrip() {
  const [active, setActive] = useState<ActiveTimer | null>(null);
  const [, forceTick] = useState(0);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/timers/active').catch((e) => { console.error(e); return null; });
    if (res?.ok) setActive(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 15_000);
    const tick = setInterval(() => forceTick((n) => n + 1), 1_000);
    window.addEventListener('timer:changed', refresh);
    return () => { clearInterval(poll); clearInterval(tick); window.removeEventListener('timer:changed', refresh); };
  }, [refresh]);

  if (!active) return null;

  const elapsedMin = (Date.now() - new Date(active.started_at).getTime()) / 60_000;
  const totalMin = active.tasks.actual_time_min + elapsedMin;
  const est = active.tasks.time_estimate_min;
  const over = est != null && totalMin > est;
  const mm = Math.floor(elapsedMin);
  const ss = Math.floor((elapsedMin - mm) * 60).toString().padStart(2, '0');

  async function stop() {
    const res = await fetch('/api/timers/stop', { method: 'POST' }).catch((e) => { console.error(e); return null; });
    if (res?.ok) {
      setActive(null);
      window.dispatchEvent(new Event('timer:changed'));
    }
  }

  return (
    <div className="flex items-center justify-between border-b px-6 py-2"
      style={{ borderColor: 'var(--ink-2)', background: 'color-mix(in oklch, var(--accent) 8%, var(--ink-0))' }}>
      <span className="text-sm">
        ▶ <strong>{active.tasks.title}</strong>
        <span className="mono ml-3" style={{ color: over ? 'var(--danger)' : 'var(--ok)' }}>
          {mm}:{ss}
        </span>
        {est != null && (
          <span className="mono ml-2 text-xs" style={{ color: 'var(--ink-3)' }}>
            {Math.round(totalMin)}m / est {est}m
          </span>
        )}
      </span>
      <button onClick={stop} className="mono rounded border px-2 py-0.5 text-xs"
        style={{ borderColor: 'var(--ink-2)' }}>
        ■ STOP
      </button>
    </div>
  );
}
