'use client';
import type { Task } from '@/lib/types';
import { needsPrioritise } from '@/lib/types';

// Short "Sep 24" style formatting, same convention as TaskCard's
// formatDueDate -- parsed as local midnight since due_date has no time
// component, avoiding a day-shift in negative-UTC-offset zones.
function formatDueDate(dueDate: string): string {
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Sits directly below GoalBanner, same slot the old NeedsInputBanner used
// (removed 2026-09-24 once Needs Review became its own kanban column) --
// but this is a different signal: not "waiting on Brendan," it's "due today
// or within 3 days, or flagged urgency='today'" (needsPrioritise, the same
// rule that drives the Prioritise badge on the cards). Styled light red
// instead of the old gold, one consistent red across both. Renders nothing
// when nothing qualifies, same "no empty section" rule as the gold
// decisions-log block.
export default function NeedsAttentionSoon({ tasks, onSelect }: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const soon = tasks.filter(needsPrioritise);
  if (soon.length === 0) return null;

  return (
    <div
      style={{
        background: 'rgba(179,38,30,.06)',
        border: '1px solid rgba(179,38,30,.25)',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 20,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        font: "700 11px 'Archivo', sans-serif", color: '#b3261e',
        letterSpacing: '.06em', textTransform: 'uppercase',
      }}>
        <span style={{ fontSize: 12 }}>⏰</span> Needs Attention Soon
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {soon.map((task) => (
          <div
            key={task.id}
            onClick={() => onSelect(task.id)}
            style={{
              padding: '6px 4px', borderRadius: 5, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(179,38,30,.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{
              font: "600 13.5px 'Inter Tight', sans-serif", color: '#111',
            }}>{task.title}</div>
            {task.due_date && (
              <div style={{
                font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)',
                marginTop: 2,
              }}>Due {formatDueDate(task.due_date)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
