'use client';
import { useState } from 'react';
import Panel from '@/components/ui/Panel';
import { addDaysToKey } from '@/lib/dates';
import { dayScore } from '@/lib/scorecard';
import { useScorecardDay } from '@/lib/useScorecardDay';

function prettyDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export default function TodayView({
  today, date, onDateChange,
}: { today: string; date: string; onDateChange: (d: string) => void }) {
  const { day, error, edit, changeHabit } = useScorecardDay(date);
  const [editing, setEditing] = useState(false);
  const [newItem, setNewItem] = useState('');

  const items = day?.items ?? [];
  const pct = dayScore(items);
  const doneCount = items.filter((i) => i.done).length;
  const isToday = date === today;

  const arrow = (label: string, onClick: () => void, disabled = false) => (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      style={{
        width: 44, height: 44, borderRadius: 10, border: '1px solid var(--ink-2)',
        background: 'var(--ink-1)', fontSize: 18, opacity: disabled ? 0.3 : 1,
      }}
    >{label === 'Previous day' ? '‹' : '›'}</button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {arrow('Previous day', () => onDateChange(addDaysToKey(date, -1)))}
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: "700 15px 'Archivo', sans-serif" }}>{isToday ? 'Today' : prettyDate(date)}</div>
          {isToday && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{prettyDate(date)}</div>}
        </div>
        {arrow('Next day', () => onDateChange(addDaysToKey(date, 1)), isToday)}
      </div>

      <Panel>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ font: "800 64px/1 'Archivo', sans-serif", color: pct === null ? 'var(--ink-3)' : 'var(--ink-4)' }}>
            {pct === null ? '–' : `${Math.round(pct)}%`}
          </div>
          <div style={{ marginTop: 6, color: 'var(--ink-3)', fontSize: 14 }}>
            {day ? `${doneCount} of ${items.length} done` : 'Loading…'}
          </div>
        </div>
      </Panel>

      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

      <Panel
        title="Habits"
        right={isToday ? (
          <button onClick={() => setEditing((v) => !v)} style={{ fontSize: 12, color: 'var(--ink-3)', textDecoration: 'underline' }}>
            {editing ? 'Done editing' : 'Edit habits'}
          </button>
        ) : undefined}
      >
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2">
              <button
                onClick={() => !(editing && isToday) && edit({ toggle: i.id, done: !i.done })}
                aria-pressed={i.done}
                className="flex flex-1 items-center gap-3 text-left"
                style={{
                  minHeight: 52, padding: '8px 12px', borderRadius: 10,
                  border: '1px solid var(--ink-2)',
                  background: i.done ? 'color-mix(in oklch, var(--ok) 14%, var(--ink-1))' : 'var(--ink-1)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center',
                    border: `2px solid ${i.done ? 'var(--ok)' : 'var(--ink-3)'}`,
                    background: i.done ? 'var(--ok)' : 'transparent', color: '#fff', fontSize: 14,
                  }}
                >{i.done ? '✓' : ''}</span>
                <span style={{ fontSize: 15, textDecoration: i.done ? 'line-through' : 'none', color: i.done ? 'var(--ink-3)' : 'var(--ink-4)' }}>
                  {i.name}
                </span>
              </button>
              {editing && isToday && (
                <button
                  onClick={() => (i.habit_id ? changeHabit('PATCH', { id: i.habit_id, archive: true }) : edit({ remove: i.id }))}
                  aria-label={`Remove ${i.name}`}
                  style={{ width: 44, height: 44, color: 'var(--danger)', fontSize: 18 }}
                >×</button>
              )}
            </li>
          ))}
          {day && items.length === 0 && <li style={{ color: 'var(--ink-3)', fontSize: 14 }}>No habits on this day.</li>}
        </ul>

        {editing && isToday && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) { void changeHabit('POST', { name: newItem }); setNewItem(''); } }}
          >
            <input
              value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="New habit"
              style={{ flex: 1, minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--ink-2)', background: 'var(--ink-1)', fontSize: 16 }}
            />
            <button type="submit" style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, background: 'var(--ink-4)', color: 'var(--ink-0)', fontWeight: 600 }}>Add</button>
          </form>
        )}
      </Panel>

      {day && (
        <Panel title="One-line note">
          <input
            key={day.date} defaultValue={day.note ?? ''} placeholder="How did the day go?"
            onBlur={(e) => { if (e.target.value.trim() !== (day.note ?? '')) edit({ note: e.target.value }); }}
            style={{ width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--ink-2)', background: 'var(--ink-1)', fontSize: 16 }}
          />
        </Panel>
      )}

      <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        A day you skip counts as 0%. Adding or removing a habit is permanent from today on. Past days keep the list they had.
      </p>
    </div>
  );
}
