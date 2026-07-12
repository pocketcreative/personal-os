'use client';
import { useRef, useState } from 'react';
import { useMediaQuery } from '@/lib/useMediaQuery';
import TaskBoardDesktop from '@/components/tasks/TaskBoardDesktop';
import TaskBoardMobile from '@/components/tasks/TaskBoardMobile';

function SmartAsk({ isDesktop }: { isDesktop: boolean }) {
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Guards two things the disabled-button attribute alone can't: an Enter
  // keypress firing a second overlapping request before React re-renders
  // busy=true, and a slow earlier response arriving after a faster later
  // one and clobbering the newer, correct result. Ported from the old
  // SmartView's identical guard.
  const requestIdRef = useRef(0);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    const requestId = ++requestIdRef.current;
    setBusy(true);
    const res = await fetch('/api/tasks/smart', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
    }).catch((err) => { console.error(err); return null; });
    if (requestId !== requestIdRef.current) return;
    setBusy(false);
    if (!res?.ok) { setNote('Smart search unavailable — try again.'); return; }
    const json = await res.json();
    setNote(json.note);
  }

  // Horizontal inset matches each breakpoint's board padding exactly: desktop's
  // card sits 24px inside TaskBoardDesktop's own wrapper, mobile's cards sit
  // 16px inside TaskBoardMobile's list padding — both nested inside the shared
  // layout's 24px `<main>` padding. Keeping this in sync with the Ask card's
  // own side padding is what makes it read as a continuation of the board
  // above rather than a misaligned add-on.
  const sidePad = isDesktop ? 24 : 16;

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: `0 ${sidePad}px 56px` }}>
      <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, padding: '24px 28px', boxShadow: '0 2px 18px rgba(0,0,0,.05)' }}>
        <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>
          Ask
        </div>
        <form onSubmit={ask} style={{ display: 'flex', gap: 8, marginBottom: note ? 14 : 0 }}>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} disabled={busy}
            placeholder="what should I focus on first?"
            style={{
              flex: 1, font: "500 14px 'Inter Tight', sans-serif", color: '#111',
              padding: '10px 14px', border: '1px solid rgba(17,17,17,.12)', borderRadius: 7,
              background: '#fff', outline: 'none',
            }}
          />
          <button type="submit" disabled={busy} style={{
            font: "600 13px 'Inter Tight', sans-serif", color: '#fff',
            background: busy ? 'rgba(154,122,46,.5)' : '#9a7a2e',
            border: 'none', borderRadius: 7, padding: '10px 20px', cursor: busy ? 'default' : 'pointer',
          }}>
            {busy ? '…' : 'Ask'}
          </button>
        </form>
        {note && (
          <p style={{ font: "500 14px 'Inter Tight', sans-serif", color: '#111', lineHeight: 1.5, margin: 0 }}>
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  return (
    <div>
      {isDesktop ? <TaskBoardDesktop /> : <TaskBoardMobile />}
      <SmartAsk isDesktop={isDesktop} />
    </div>
  );
}
