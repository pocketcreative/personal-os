'use client';
import { useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import TaskRow from './TaskRow';

export default function SmartView({ tasks, onComplete, onOpen, onStartTimer }: {
  tasks: Task[];
  onComplete: (t: Task) => void;
  onOpen: (t: Task) => void;
  onStartTimer: (t: Task) => void;
}) {
  const [query, setQuery] = useState('');
  const [ids, setIds] = useState<string[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Guards two things the disabled-button attribute alone can't: an Enter
  // keypress firing a second overlapping request before React re-renders
  // busy=true (same class of bug fixed for CaptureBox in Task 13), and a
  // slow earlier response arriving after a faster later one and clobbering
  // the newer, correct result.
  const requestIdRef = useRef(0);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    const requestId = ++requestIdRef.current;
    setBusy(true);
    const res = await fetch('/api/tasks/smart', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
    }).catch((err) => { console.error(err); return null; });
    if (requestId !== requestIdRef.current) return; // a newer request already superseded this one
    setBusy(false);
    if (!res?.ok) { setNote('Smart search unavailable — try again.'); return; }
    const json = await res.json();
    setIds(json.ids);
    setNote(json.note);
  }

  const shown = ids === null ? [] : ids.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t);

  return (
    <div>
      <form onSubmit={ask} className="mb-3 flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} disabled={busy}
          placeholder="what should I knock out in the next hour?"
          className="flex-1 rounded border bg-transparent p-2 text-sm"
          style={{ borderColor: 'var(--ink-2)' }} />
        <button type="submit" disabled={busy} className="rounded px-3 text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>
      {note && <p className="mb-2 text-sm" style={{ color: 'var(--ink-3)' }}>{note}</p>}
      {shown.map((t) => (
        <TaskRow key={t.id} task={t} onComplete={onComplete} onOpen={onOpen} onStartTimer={onStartTimer} />
      ))}
    </div>
  );
}
