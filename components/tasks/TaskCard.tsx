'use client';
import type { Task } from '@/lib/types';
import { URGENCY_LABELS } from '@/lib/types';
import FieldPopover from './FieldPopover';
import { STATUS_LABELS } from '@/lib/types';

const STATUS_DOT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.3)', in_progress: '#eab308', completed: '#2f9e44', archived: 'rgba(154,122,46,.4)',
};
const STATUS_TEXT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.45)', in_progress: '#a16207', completed: '#227a37', archived: 'rgba(154,122,46,.65)',
};

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

export default function TaskCard({ task, onOpen, onChangeStatus }: {
  task: Task;
  onOpen: () => void;
  onChangeStatus: (status: Task['status']) => void;
}) {
  const isCompleted = task.status === 'completed';
  const preview = task.needs_input && task.input_note ? task.input_note : task.description;

  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid rgba(17,17,17,.08)', borderRadius: 10,
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <FieldPopover
            trigger={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: "600 11px 'Inter Tight', sans-serif", color: STATUS_TEXT[task.status] }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[task.status] }} />
                {STATUS_LABELS[task.status]}
              </span>
            }
            options={[
              { label: 'Not started', onSelect: () => onChangeStatus('not_started') },
              { label: 'In progress', onSelect: () => onChangeStatus('in_progress') },
              { label: 'Completed', onSelect: () => onChangeStatus('completed') },
              { label: 'Archived', onSelect: () => onChangeStatus('archived') },
            ]}
          />
          {task.task_type === 'scheduled' && (
            <span title="Scheduled (recurring)" style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
              ↻
            </span>
          )}
        </div>
        {(task.urgency === 'today' || task.urgency === 'this_week') && (
          <span style={{
            font: "700 10px 'Inter Tight', sans-serif",
            color: task.urgency === 'today' ? '#b3261e' : '#9a7a2e',
            background: task.urgency === 'today' ? 'rgba(179,38,30,.08)' : 'rgba(198,161,91,.12)',
            borderRadius: 20, padding: '3px 8px',
          }}>
            {URGENCY_LABELS[task.urgency]}
          </span>
        )}
      </div>
    </div>
  );
}
