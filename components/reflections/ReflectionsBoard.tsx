'use client';
import { useEffect, useRef, useState } from 'react';
import { useReflections, fetchEntryFresh, type AutosaveResult, type ReflectionEntry } from '@/lib/useReflections';

const AUTOSAVE_DEBOUNCE_MS = 1500;
const MAX_SAVE_INTERVAL_MS = 10_000;

function formatEntryDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

type SaveEntryFn = (date: string, text: string, topic: string | null, expected: string) => Promise<AutosaveResult>;

function ReflectionModal({ date, saveEntry, onClose }: {
  date: string;
  saveEntry: SaveEntryFn;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'merged' | 'error'>('idle');
  // Refs, not state, for values doSave needs to read at call time -- doSave
  // is invoked from a debounce timeout and a periodic interval, both set up
  // once on mount, so they must not close over stale state snapshots.
  const stateRef = useRef({ text: '', topic: '', savedText: '', savedTopic: '' });
  const isSavingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEntryFresh(date).then((e) => {
      if (cancelled) return;
      const initialTopic = e.topic ?? '';
      setText(e.raw_text);
      setTopic(initialTopic);
      stateRef.current = { text: e.raw_text, topic: initialTopic, savedText: e.raw_text, savedTopic: initialTopic };
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    stateRef.current.text = text;
    stateRef.current.topic = topic;
  }, [text, topic]);

  const doSave = async () => {
    if (isSavingRef.current) return;
    const { text: submittedText, topic: submittedTopic, savedText, savedTopic } = stateRef.current;
    if (submittedText === savedText && submittedTopic === savedTopic) return;
    isSavingRef.current = true;
    setStatus('saving');
    try {
      const result = await saveEntry(date, submittedText, submittedTopic.trim() || null, savedText);
      if (!result.ok) { setStatus('error'); return; }
      stateRef.current.savedText = result.savedText;
      stateRef.current.savedTopic = submittedTopic;
      // Only overwrite the visible textarea if the user hasn't typed
      // anything new since this particular save was submitted -- otherwise
      // a slow round-trip could clobber a newer in-progress draft with the
      // merged result of an OLDER one. If they have kept typing, the saved
      // baseline above still updates correctly for the NEXT autosave tick.
      setText((current) => (current === submittedText ? result.savedText : current));
      setStatus(result.merged ? 'merged' : 'saved');
    } finally {
      isSavingRef.current = false;
    }
  };

  const scheduleAutosave = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doSave, AUTOSAVE_DEBOUNCE_MS);
  };

  useEffect(() => {
    // A ceiling independent of the debounce, so a long uninterrupted typing
    // session (never pausing 1.5s) still can't lose more than ~10s of work.
    const interval = setInterval(doSave, MAX_SAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      // Flush any pending debounced edit on unmount, not just on the
      // explicit close button -- otherwise a future navigation path that
      // unmounts this modal without going through handleClose would drop
      // the last few keystrokes typed since the previous autosave tick.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        doSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSave reads current values via stateRef, not a stale closure
  }, []);

  const handleClose = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSave();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#fbfaf7', zIndex: 70,
      display: 'flex', flexDirection: 'column', padding: '20px 24px 24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ font: "800 16px 'Archivo', sans-serif", color: '#111' }}>{formatEntryDate(date)}</div>
        <span onClick={handleClose} style={{ cursor: 'pointer', color: 'rgba(17,17,17,.4)', fontSize: 18 }}>✕</span>
      </div>
      {!ready ? (
        <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <input
            value={topic}
            onChange={(e) => { setTopic(e.target.value); scheduleAutosave(); }}
            placeholder="Topic (optional)"
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(17,17,17,.12)',
              marginBottom: 10, fontFamily: "'Inter Tight', sans-serif", fontWeight: 600, fontSize: 16,
              color: '#111', background: '#fff', boxSizing: 'border-box', flexShrink: 0,
            }}
          />
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); scheduleAutosave(); }}
            placeholder="What happened today?"
            style={{
              width: '100%', flex: 1, lineHeight: 1.5, color: '#111',
              resize: 'none', padding: '12px 14px', border: '1px solid rgba(17,17,17,.1)',
              borderRadius: 6, background: '#fff', boxSizing: 'border-box',
              fontFamily: "'Inter Tight', sans-serif", outline: 'none', fontSize: 16,
            }}
          />
          <div style={{
            marginTop: 8, font: "600 11px 'Inter Tight', sans-serif", flexShrink: 0,
            color: status === 'error' ? '#b3261e' : 'rgba(17,17,17,.35)',
          }}>
            {status === 'saving' && 'Saving…'}
            {status === 'saved' && 'Saved automatically'}
            {status === 'merged' && 'Merged a recent change in — saved'}
            {status === 'error' && 'Save failed — will retry automatically'}
          </div>
        </div>
      )}
    </div>
  );
}

function ReflectionRow({ entry, onOpen, onDelete }: {
  entry: ReflectionEntry;
  onOpen: (date: string) => void;
  onDelete: (date: string) => void;
}) {
  const preview = entry.raw_text.length > 150 ? `${entry.raw_text.slice(0, 150)}…` : entry.raw_text;
  return (
    <div
      onClick={() => onOpen(entry.entry_date)}
      style={{ padding: '14px 0', borderBottom: '1px solid rgba(17,17,17,.06)', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ font: "700 13px 'Inter Tight', sans-serif", color: '#9a7a2e', marginBottom: 4 }}>
          {formatEntryDate(entry.entry_date)}
          {entry.topic && <span style={{ color: 'rgba(17,17,17,.55)', fontWeight: 600 }}> — {entry.topic}</span>}
        </div>
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete the reflection for ${formatEntryDate(entry.entry_date)}? This can't be undone.`)) {
              onDelete(entry.entry_date);
            }
          }}
          title="Delete reflection"
          style={{
            cursor: 'pointer', color: 'rgba(17,17,17,.3)', fontSize: 15,
            padding: '2px 4px', flexShrink: 0, lineHeight: 1,
          }}
        >🗑️</span>
      </div>
      <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: '#111', whiteSpace: 'pre-wrap' }}>
        {preview || <span style={{ color: 'rgba(17,17,17,.35)' }}>(empty — click to write)</span>}
      </div>
    </div>
  );
}

function matchesSearch(entry: ReflectionEntry, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    formatEntryDate(entry.entry_date).toLowerCase().includes(q) ||
    (entry.topic?.toLowerCase().includes(q) ?? false) ||
    entry.raw_text.toLowerCase().includes(q)
  );
}

export default function ReflectionsBoard() {
  const { data, saveEntry, deleteEntry } = useReflections();
  const [query, setQuery] = useState('');
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Deliberately NOT synthesizing a placeholder row for today when no entry
  // exists yet -- the list shows only reflections that actually exist. A new
  // entry is created explicitly (the button below), not implicitly conjured
  // every day just because the calendar turned over.
  const visibleEntries = data ? data.entries.filter((e) => matchesSearch(e, query)) : [];

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '32px 16px 56px', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '32px 24px 28px',
      }}>
        <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', marginBottom: 20 }}>
          Reflections
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by topic, date, or reflection text…"
            style={{
              flex: '1 1 220px', minWidth: 0, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(17,17,17,.15)',
              fontFamily: "'Inter Tight', sans-serif", fontWeight: 500, fontSize: 16, color: '#111',
              background: '#fff', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => data && setOpenDate(data.today)}
            disabled={!data}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none', background: '#9a7a2e', color: '#fff',
              font: "700 13px 'Inter Tight', sans-serif", cursor: data ? 'pointer' : 'default',
              whiteSpace: 'nowrap', opacity: data ? 1 : .6,
            }}
          >Write today&apos;s reflection</button>
        </div>

        {!data && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
        )}

        {data && visibleEntries.length === 0 && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
            {query.trim() ? 'No reflections match that search.' : 'No reflections yet — write one above, or send one via Telegram.'}
          </div>
        )}

        {data && visibleEntries.map((entry) => (
          <ReflectionRow key={entry.entry_date} entry={entry} onOpen={setOpenDate} onDelete={deleteEntry} />
        ))}
      </div>

      {openDate && (
        // key={openDate} forces a clean unmount/remount if openDate ever
        // changes directly from one date to another without passing through
        // handleClose first (no such path exists today, but this removes
        // the implicit dependence on that being true).
        <ReflectionModal key={openDate} date={openDate} saveEntry={saveEntry} onClose={() => setOpenDate(null)} />
      )}
    </div>
  );
}
