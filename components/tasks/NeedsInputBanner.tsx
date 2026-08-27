'use client';
import type { Task } from '@/lib/types';

// Sits directly below GoalBanner, same slot in both boards. Unlike
// GoalBanner (solid black, one line), this can hold several rows, so it
// uses the gold/amber palette already used elsewhere for "needs Brendan's
// attention" signals (the ⚠️ badge, the TODAY pill) rather than another
// black block — reads as part of the same visual language without
// competing with the goal banner for the "most important thing" slot.
// Renders nothing at all when there's nothing waiting on him — an empty
// "nothing needs your input" state would just be more noise to scan past.
export default function NeedsInputBanner({ tasks, onSelect }: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const pending = tasks.filter((t) => t.needs_input);
  if (pending.length === 0) return null;

  return (
    <div
      style={{
        background: 'rgba(198,161,91,.1)',
        border: '1px solid rgba(198,161,91,.35)',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 20,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        font: "700 11px 'Archivo', sans-serif", color: '#9a7a2e',
        letterSpacing: '.06em', textTransform: 'uppercase',
      }}>
        <span style={{ fontSize: 12 }}>⚠️</span> Needs Your Input
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {pending.map((task) => (
          <div
            key={task.id}
            onClick={() => onSelect(task.id)}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              padding: '6px 4px', borderRadius: 5, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(198,161,91,.14)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{
              font: "600 13.5px 'Inter Tight', sans-serif", color: '#111', flex: 'none',
            }}>{task.title}</span>
            {task.input_note && (
              <span style={{
                font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
              }}>{task.input_note}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
