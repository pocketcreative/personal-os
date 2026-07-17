'use client';
import { useState } from 'react';
import { useHabits } from '@/lib/useHabits';
import { calcCompletionPercent } from '@/lib/habitStats';
import { dateKeyDayOfWeek } from '@/lib/dates';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function StatChip({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div style={{
        font: "700 10px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)',
        letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4,
      }}>{label}</div>
      <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#9a7a2e' }}>
        {value === null ? '—' : `${value}%`}
      </div>
    </div>
  );
}

export default function HabitsBoard() {
  const { data, toggleLog, addHabit, renameHabit, archiveHabit } = useHabits();
  const [addingName, setAddingName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAdd = () => {
    const name = addingName.trim();
    if (!name) return;
    addHabit(name);
    setAddingName('');
  };

  const startEdit = (habit: { id: string; name: string }) => {
    setEditingId(habit.id);
    setEditingName(habit.name);
  };

  const commitEdit = () => {
    const name = editingName.trim();
    if (editingId && name) renameHabit(editingId, name);
    setEditingId(null);
  };

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '32px 16px 56px', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '32px 24px 28px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16, marginBottom: 28,
        }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Habits</div>
          {data && (
            <div style={{ display: 'flex', gap: 28 }}>
              <StatChip label="This month" value={calcCompletionPercent(data.habits, data.logs, data.monthStart, data.today)} />
              <StatChip label="This year" value={calcCompletionPercent(data.habits, data.logs, data.yearStart, data.today)} />
            </div>
          )}
        </div>

        {!data && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
        )}

        {data && data.habits.length === 0 && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginBottom: 8 }}>
            No habits yet — add one below.
          </div>
        )}

        {data && data.habits.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 180 + 7 * 44 + 32 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: '#fbfaf7', width: 180 }} />
                  {data.weekDates.map((date, i) => (
                    <th key={date} style={{
                      width: 44, textAlign: 'center', fontWeight: 700,
                      font: "700 11px 'Archivo', sans-serif",
                      color: date === data.today ? '#9a7a2e' : 'rgba(17,17,17,.4)',
                      letterSpacing: '.03em', textTransform: 'uppercase', paddingBottom: 10,
                    }}>{DAY_LABELS[i]}</th>
                  ))}
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {data.habits.map((habit) => (
                  <tr key={habit.id}>
                    <td style={{
                      position: 'sticky', left: 0, background: '#fbfaf7', textAlign: 'left',
                      font: "500 14px 'Inter Tight', sans-serif", color: '#111',
                      padding: '10px 12px 10px 0', borderTop: '1px solid rgba(17,17,17,.06)',
                    }}>
                      {editingId === habit.id ? (
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onBlur={commitEdit}
                          style={{
                            width: '100%', padding: '4px 6px', borderRadius: 6,
                            border: '1px solid rgba(17,17,17,.15)',
                            font: "500 14px 'Inter Tight', sans-serif", color: '#111',
                          }}
                        />
                      ) : (
                        <span onClick={() => startEdit(habit)} style={{ cursor: 'pointer' }}>{habit.name}</span>
                      )}
                    </td>
                    {data.weekDates.map((date) => {
                      const scheduled = habit.schedule_days.includes(dateKeyDayOfWeek(date));
                      const done = data.logs.some(
                        (l) => l.habit_id === habit.id && l.log_date === date && l.completed,
                      );
                      return (
                        <td key={date} style={{ textAlign: 'center', borderTop: '1px solid rgba(17,17,17,.06)' }}>
                          <div
                            onClick={() => scheduled && toggleLog(habit.id, date, !done)}
                            style={{
                              width: 24, height: 24, borderRadius: 6, margin: '0 auto',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: scheduled ? 'pointer' : 'default',
                              background: done ? '#9a7a2e' : scheduled ? '#fff' : 'transparent',
                              border: scheduled ? '1px solid rgba(17,17,17,.15)' : 'none',
                              color: '#fff', fontSize: 13, fontWeight: 700,
                            }}
                          >{done ? '✓' : ''}</div>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', borderTop: '1px solid rgba(17,17,17,.06)' }}>
                      <div
                        onClick={() => archiveHabit(habit.id)}
                        title="Archive habit"
                        style={{
                          width: 20, height: 20, margin: '0 auto',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: 'rgba(17,17,17,.3)', fontSize: 14,
                        }}
                      >×</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(17,17,17,.08)' }}>
          <input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add a habit…"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(17,17,17,.15)',
              font: "500 13px 'Inter Tight', sans-serif", color: '#111', background: '#fff',
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', background: '#9a7a2e', color: '#fff',
              font: "700 13px 'Inter Tight', sans-serif", cursor: 'pointer',
            }}
          >Add</button>
        </div>
      </div>
    </div>
  );
}
