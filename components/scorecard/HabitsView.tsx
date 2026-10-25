'use client';
import { useState } from 'react';
import Panel from '@/components/ui/Panel';
import { useHabits } from '@/lib/useScorecardApi';

const input: React.CSSProperties = {
  minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--ink-2)',
  background: 'var(--ink-1)', fontSize: 16,
};
const small: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 10, border: '1px solid var(--ink-2)', background: 'var(--ink-1)', fontSize: 16,
};

export default function HabitsView() {
  const { data, error, send } = useHabits();
  const [name, setName] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  if (!data) return <p style={{ color: 'var(--ink-3)' }}>{error ?? 'Loading…'}</p>;
  const active = data.habits.filter((h) => h.active);
  const archived = data.habits.filter((h) => !h.active);

  const move = (idx: number, dir: -1 | 1) => {
    const ids = active.map((h) => h.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void send('PATCH', { order: ids });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      <Panel title="Active habits">
        <ul className="flex flex-col gap-2">
          {active.map((h, idx) => (
            <li key={h.id} className="flex items-center gap-2">
              <textarea
                key={h.name} defaultValue={h.name} aria-label="Habit name" rows={2}
                style={{ ...input, flex: 1, minWidth: 0, padding: '8px 12px', resize: 'none', lineHeight: 1.3 }}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== h.name) void send('PATCH', { id: h.id, name: v }); }}
              />
              <button style={small} onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Move up">↑</button>
              <button style={small} onClick={() => move(idx, 1)} disabled={idx === active.length - 1} aria-label="Move down">↓</button>
              <button style={{ ...small, color: 'var(--danger)' }} onClick={() => send('PATCH', { id: h.id, archive: true })} aria-label={`Archive ${h.name}`}>⌫</button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) { void send('POST', { name }); setName(''); } }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New habit" style={{ ...input, flex: 1 }} />
          <button type="submit" style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, background: 'var(--ink-4)', color: 'var(--ink-0)', fontWeight: 600 }}>Add</button>
        </form>
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>
          Changes apply to today and later only. Past days keep the list they had.
        </p>
      </Panel>

      <Panel title="Streak">
        <label className="flex items-center gap-3" style={{ fontSize: 14 }}>
          A day counts toward the streak at
          <input
            key={data.threshold} type="number" min={1} max={100} defaultValue={data.threshold}
            style={{ ...input, width: 80 }}
            onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 100 && v !== data.threshold) void send('PATCH', { threshold: v }); }}
          />
          % or more
        </label>
      </Panel>

      <Panel
        title={`Archived (${archived.length})`}
        right={archived.length > 0 ? (
          <button onClick={() => setShowArchived((v) => !v)} style={{ fontSize: 12, color: 'var(--ink-3)', textDecoration: 'underline' }}>
            {showArchived ? 'Hide' : 'Show'}
          </button>
        ) : undefined}
      >
        {showArchived && (
          <ul className="flex flex-col gap-2">
            {archived.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2" style={{ fontSize: 14 }}>
                <span style={{ color: 'var(--ink-3)' }}>{h.name}</span>
                <button onClick={() => send('PATCH', { id: h.id, restore: true })} style={{ minHeight: 44, padding: '0 12px', border: '1px solid var(--ink-2)', borderRadius: 10 }}>Restore</button>
              </li>
            ))}
          </ul>
        )}
        {archived.length === 0 && <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>None.</p>}
      </Panel>
    </div>
  );
}
