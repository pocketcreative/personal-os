'use client';
import { useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import {
  AGENT_TAGS, STAGE_LABELS, TASK_TYPES, TASK_TYPE_LABELS, URGENCIES, URGENCY_LABELS, taskStage,
} from '@/lib/types';

export interface TaskDetailPatch {
  title?: string;
  description?: string;
  owner?: string;
  needs_input?: boolean;
  input_note?: string | null;
  agent_tags?: string[];
  task_type?: Task['task_type'];
  urgency?: Task['urgency'];
  due_date?: string | null;
}

const STAGE_DOT: Record<string, string> = {
  not_started: 'rgba(17,17,17,.3)', in_progress: '#eab308', needs_review: '#9a7a2e',
  completed: '#2f9e44', archived: 'rgba(154,122,46,.4)',
};

export default function TaskDetailModal({ task, onClose, onSave, onDelete }: {
  task: Task;
  onClose: () => void;
  onSave: (patch: TaskDetailPatch) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [owner, setOwner] = useState(task.owner ?? '');
  const [needsInput, setNeedsInput] = useState(!!task.needs_input);
  const [inputNote, setInputNote] = useState(task.input_note ?? '');
  const [agentTags, setAgentTags] = useState<string[]>(task.agent_tags ?? []);
  const [customTagDraft, setCustomTagDraft] = useState('');
  const [taskType, setTaskType] = useState<Task['task_type']>(task.task_type ?? 'single');
  const [urgency, setUrgency] = useState<Task['urgency']>(task.urgency);
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const stage = taskStage(task);

  // Auto-grow the title field so a long title wraps and stays fully
  // visible/editable instead of scrolling sideways inside a single line.
  useEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [name]);

  function done() {
    if (name !== task.title) onSave({ title: name });
    if (description !== (task.description ?? '')) onSave({ description });
    if (owner !== task.owner) onSave({ owner });
    const trimmedNote = inputNote.trim() || null;
    if (needsInput !== task.needs_input || trimmedNote !== task.input_note) {
      onSave({ needs_input: needsInput, input_note: needsInput ? trimmedNote : null });
    }
    const existingTags = task.agent_tags ?? [];
    if (agentTags.length !== existingTags.length || agentTags.some((t, i) => t !== existingTags[i])) {
      onSave({ agent_tags: agentTags });
    }
    if (taskType !== (task.task_type ?? 'single')) onSave({ task_type: taskType });
    if (urgency !== task.urgency) onSave({ urgency });
    const trimmedDue = dueDate.trim() || null;
    if (trimmedDue !== task.due_date) onSave({ due_date: trimmedDue });
    onClose();
  }

  function toggleTag(tag: string) {
    setAgentTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  }

  function addCustomTag() {
    const t = customTagDraft.trim();
    if (t && !agentTags.includes(t)) setAgentTags((cur) => [...cur, t]);
    setCustomTagDraft('');
  }

  return (
    <div
      onClick={done}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,17,17,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 70, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fbfaf7', borderRadius: 12, width: 520, maxWidth: '100%',
          maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ padding: '32px 32px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <textarea
            ref={nameRef}
            value={name} onChange={(e) => setName(e.target.value)}
            rows={1}
            style={{
              flex: 1, font: "700 21px 'Inter Tight', sans-serif", color: '#111',
              letterSpacing: '-0.01em', padding: '4px 0', border: 'none', outline: 'none', background: 'transparent',
              resize: 'none', overflow: 'hidden',
            }}
          />
          <span onClick={done} style={{ cursor: 'pointer', color: 'rgba(17,17,17,.4)', fontSize: 18, padding: 4 }}>✕</span>
        </div>
        <div style={{ padding: '0 32px 8px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, font: "600 12px 'Inter Tight', sans-serif",
            color: 'rgba(17,17,17,.6)', background: 'rgba(17,17,17,.05)', borderRadius: 20, padding: '5px 12px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STAGE_DOT[stage] }} />
            {STAGE_LABELS[stage]}
          </span>
        </div>
        <div style={{ padding: '8px 32px 32px' }}>
          <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Description
          </div>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this task…"
            style={{
              width: '100%', minHeight: 140, fontSize: 16, lineHeight: 1.5, color: '#111',
              resize: 'vertical', padding: '12px 14px', border: '1px solid rgba(17,17,17,.1)',
              borderRadius: 6, background: '#fff', boxSizing: 'border-box',
              fontFamily: "'Inter Tight', sans-serif", outline: 'none',
            }}
          />

          <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', margin: '20px 0 10px' }}>
            Agents Assigned
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {Array.from(new Set([...AGENT_TAGS, ...agentTags])).map((tag) => {
              const active = agentTags.includes(tag);
              return (
                <span
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  style={{
                    cursor: 'pointer', font: "600 12px 'Inter Tight', sans-serif",
                    color: active ? '#9a7a2e' : 'rgba(17,17,17,.55)',
                    background: active ? 'rgba(198,161,91,.14)' : 'rgba(17,17,17,.05)',
                    border: `1px solid ${active ? 'rgba(198,161,91,.4)' : 'transparent'}`,
                    borderRadius: 20, padding: '6px 12px',
                  }}
                >
                  {tag}
                </span>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              value={customTagDraft} onChange={(e) => setCustomTagDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
              placeholder="Add a custom agent tag…"
              style={{
                flex: 1, fontSize: 13, color: '#111', padding: '8px 12px',
                border: '1px solid rgba(17,17,17,.1)', borderRadius: 6, background: '#fff',
                boxSizing: 'border-box', fontFamily: "'Inter Tight', sans-serif", outline: 'none',
              }}
            />
            <button
              onClick={addCustomTag}
              style={{
                font: "600 12px 'Inter Tight', sans-serif", color: '#111', background: 'rgba(17,17,17,.06)',
                border: 'none', borderRadius: 6, padding: '0 14px', cursor: 'pointer',
              }}
            >
              Add
            </button>
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Type
              </div>
              <select
                value={taskType} onChange={(e) => setTaskType(e.target.value as Task['task_type'])}
                style={{
                  width: '100%', fontSize: 14, color: '#111', padding: '9px 12px',
                  border: '1px solid rgba(17,17,17,.1)', borderRadius: 6, background: '#fff',
                  boxSizing: 'border-box', fontFamily: "'Inter Tight', sans-serif", outline: 'none',
                }}
              >
                {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Urgency
              </div>
              <select
                value={urgency} onChange={(e) => setUrgency(e.target.value as Task['urgency'])}
                style={{
                  width: '100%', fontSize: 14, color: '#111', padding: '9px 12px',
                  border: '1px solid rgba(17,17,17,.1)', borderRadius: 6, background: '#fff',
                  boxSizing: 'border-box', fontFamily: "'Inter Tight', sans-serif", outline: 'none',
                }}
              >
                {URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
              </select>
            </div>
          </div>

          <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', margin: '20px 0 10px' }}>
            Due Date
          </div>
          <input
            type="date"
            value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            style={{
              width: '100%', fontSize: 14, color: '#111', padding: '9px 12px',
              border: '1px solid rgba(17,17,17,.1)', borderRadius: 6, background: '#fff',
              boxSizing: 'border-box', fontFamily: "'Inter Tight', sans-serif", outline: 'none',
            }}
          />

          <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', margin: '20px 0 10px' }}>
            Owner
          </div>
          <input
            value={owner} onChange={(e) => setOwner(e.target.value)}
            placeholder="Leave blank for Brendan, or type ai / azel / fahad…"
            style={{
              width: '100%', fontSize: 15, color: '#111', padding: '10px 14px',
              border: '1px solid rgba(17,17,17,.1)', borderRadius: 6, background: '#fff',
              boxSizing: 'border-box', fontFamily: "'Inter Tight', sans-serif", outline: 'none',
            }}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, cursor: 'pointer' }}>
            <input type="checkbox" checked={needsInput} onChange={(e) => setNeedsInput(e.target.checked)} />
            <span style={{ font: "600 13px 'Inter Tight', sans-serif", color: '#111' }}>Needs Brendan&apos;s input</span>
          </label>
          {needsInput && (
            <input
              value={inputNote} onChange={(e) => setInputNote(e.target.value)}
              placeholder="What do you need from Brendan?"
              style={{
                width: '100%', fontSize: 14, color: '#111', padding: '10px 14px', marginTop: 10,
                border: '1px solid rgba(154,122,46,.35)', borderRadius: 6, background: 'rgba(198,161,91,.08)',
                boxSizing: 'border-box', fontFamily: "'Inter Tight', sans-serif", outline: 'none',
              }}
            />
          )}
        </div>
        <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(17,17,17,.08)', display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => { if (confirm(`Delete "${task.title}"? This can't be undone.`)) onDelete(); }}
            style={{
              font: "600 13px 'Inter Tight', sans-serif", color: '#c0392b', background: 'transparent',
              border: '1px solid rgba(192,57,43,.3)', borderRadius: 7, padding: '10px 18px', cursor: 'pointer',
            }}
          >
            Delete
          </button>
          <button
            onClick={done}
            style={{
              font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#111',
              border: 'none', borderRadius: 7, padding: '10px 22px', cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
