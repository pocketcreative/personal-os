'use client';
import type { Task } from '@/lib/types';
import { needsPrioritise } from '@/lib/types';
import { ownerCellLabel } from './OwnerCell';

// Short "Sep 24" style formatting for the card face — the due_date column is
// a plain YYYY-MM-DD date with no time component, so it's parsed as local
// midnight (not UTC) to avoid shifting a day in negative-UTC-offset zones.
function formatDueDate(dueDate: string): string {
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayLocalISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Small deterministic color per agent tag so the same role always reads the
// same way across cards, without a fixed enum-to-color map that'd break the
// moment a free-text tag gets added.
const TAG_PALETTE = ['#9a7a2e', '#2f6f9e', '#4b7a4f', '#8a4fa0', '#b3541e', '#3a6b6b'];
function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function AgentBadge({ tag }: { tag: string }) {
  const color = tagColor(tag);
  return (
    <span style={{
      font: "700 10px 'Inter Tight', sans-serif", color, background: `${color}1f`,
      borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap',
    }}>
      {tag}
    </span>
  );
}

export default function TaskCard({ task, onOpen }: {
  task: Task;
  onOpen: () => void;
}) {
  const isCompleted = task.status === 'completed';
  const preview = task.needs_input && task.input_note ? task.input_note : task.description;
  const ownerLabel = ownerCellLabel(task.owner);
  const isOverdue = !!task.due_date && task.due_date < todayLocalISO()
    && task.status !== 'completed' && task.status !== 'archived';

  // Scheduled (recurring automation) cards get a genuinely different
  // background/border, not just the small ↻ icon -- blue tint since blue is
  // a primary brand color and reads as "different kind of task", not an
  // error/warning state the way red or a bare icon alone didn't stand out.
  const isScheduled = task.task_type === 'scheduled';

  return (
    <div
      onClick={onOpen}
      style={{
        background: isScheduled ? 'rgba(2,74,221,.05)' : '#fff',
        border: `1px solid ${isScheduled ? 'rgba(2,74,221,.25)' : 'rgba(17,17,17,.08)'}`,
        borderRadius: 10,
        padding: '13px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          flex: 1, font: "600 14px 'Inter Tight', sans-serif",
          color: isCompleted ? 'rgba(17,17,17,.4)' : '#111',
          textDecorationLine: isCompleted ? 'line-through' : 'none',
          textDecorationColor: 'rgba(17,17,17,.25)',
          lineHeight: 1.35,
        }}>
          {task.title}
        </span>
        {task.needs_input && <span title={task.input_note ?? 'Needs your input'} style={{ fontSize: 13, flexShrink: 0 }}>⚠️</span>}
      </div>

      {preview && (
        <div style={{
          font: "500 12px 'Inter Tight', sans-serif",
          color: task.needs_input ? '#9a7a2e' : 'rgba(17,17,17,.55)',
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {preview}
        </div>
      )}

      {task.agent_tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {task.agent_tags.map((tag) => <AgentBadge key={tag} tag={tag} />)}
        </div>
      )}

      {/* Column header already says the stage, so the card face doesn't
          repeat it — instead: owner (who's responsible) flush left, due
          date (when it's due) flush right, same reading order as any
          kanban assignee/due-date row. minWidth:0 on the left cluster lets
          a long owner name ellipsis instead of pushing the right cluster
          off the edge; flexShrink:0 on the right cluster keeps it pinned
          flush right rather than wrapping or overflowing. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
          {ownerLabel && (
            <span style={{
              font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {ownerLabel}
            </span>
          )}
          {task.task_type === 'scheduled' && (
            <span title="Scheduled (recurring)" style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', flexShrink: 0 }}>
              ↻
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {needsPrioritise(task) && (
            <span style={{
              font: "700 10px 'Inter Tight', sans-serif",
              color: '#b3261e',
              background: 'rgba(179,38,30,.08)',
              borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap',
            }}>
              Prioritise
            </span>
          )}
          {task.due_date && (
            <span style={{
              font: "600 11px 'Inter Tight', sans-serif",
              color: isOverdue ? '#b3261e' : 'rgba(17,17,17,.45)',
              whiteSpace: 'nowrap',
            }}>
              {formatDueDate(task.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
