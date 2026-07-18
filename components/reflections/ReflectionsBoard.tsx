'use client';
import { useEffect, useState } from 'react';
import { useReflections, fetchEntryFresh, type SaveResult } from '@/lib/useReflections';

function formatEntryDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

type SaveEntryFn = (date: string, text: string, expected?: string) => Promise<SaveResult>;

/**
 * Core textarea-plus-save editor, shared by the always-open "Today" card and
 * any expanded past entry. Tracks its own conflict-comparison baseline
 * separately from the initial prop: after every successful save, `baseline`
 * updates to the text that was just written, so a SECOND save in the same
 * session compares against the last known-good state rather than the
 * original mount-time value (which would otherwise cause every second save
 * in a row to falsely conflict against itself).
 */
function ReflectionEditor({ date, initialText, saveEntry }: {
  date: string;
  initialText: string;
  saveEntry: SaveEntryFn;
}) {
  const [text, setText] = useState(initialText);
  const [baseline, setBaseline] = useState(initialText);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflictText, setConflictText] = useState<string | null>(null);

  const doSave = async (force: boolean) => {
    setStatus('saving');
    const result = await saveEntry(date, text, force ? undefined : baseline);
    if (result.ok) {
      setStatus('saved');
      setConflictText(null);
      setBaseline(text);
    } else if (result.conflictText !== null) {
      setStatus('idle');
      setConflictText(result.conflictText);
    } else {
      setStatus('error');
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus('idle'); }}
        placeholder="What happened today?"
        style={{
          width: '100%', minHeight: 120, lineHeight: 1.5, color: '#111',
          resize: 'vertical', padding: '12px 14px', border: '1px solid rgba(17,17,17,.1)',
          borderRadius: 6, background: '#fff', boxSizing: 'border-box',
          fontFamily: "'Inter Tight', sans-serif", outline: 'none',
          // 16px, not smaller — iOS Safari auto-zooms the whole page on
          // focus for any input under 16px (bit us on the chat input and
          // twice in Habits already; same fix here).
          fontSize: 16,
        }}
      />
      {conflictText !== null && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 6,
          background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.2)',
        }}>
          <div style={{ font: "700 12px 'Inter Tight', sans-serif", color: '#b3261e', marginBottom: 6 }}>
            This entry changed since you opened it — probably from Telegram. Current version:
          </div>
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: '#111', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
            {conflictText || '(empty)'}
          </div>
          <button
            onClick={() => doSave(true)}
            style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', background: '#b3261e', color: '#fff',
              font: "700 12px 'Inter Tight', sans-serif", cursor: 'pointer',
            }}
          >Overwrite anyway</button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button
          onClick={() => doSave(false)}
          disabled={status === 'saving'}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', background: '#9a7a2e', color: '#fff',
            font: "700 13px 'Inter Tight', sans-serif", cursor: status === 'saving' ? 'default' : 'pointer',
            opacity: status === 'saving' ? .6 : 1,
          }}
        >Save</button>
        {status === 'saved' && <span style={{ font: "600 12px 'Inter Tight', sans-serif", color: '#4b7a4f' }}>Saved</span>}
        {status === 'error' && <span style={{ font: "600 12px 'Inter Tight', sans-serif", color: '#b3261e' }}>Save failed — try again</span>}
      </div>
    </div>
  );
}

function TodayCard({ today, saveEntry }: { today: string; saveEntry: SaveEntryFn }) {
  const [initialText, setInitialText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEntryFresh(today).then((e) => { if (!cancelled) setInitialText(e.raw_text); });
    return () => { cancelled = true; };
  }, [today]);

  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid rgba(17,17,17,.08)' }}>
      <div style={{
        font: "700 12px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)',
        letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10,
      }}>Today — {formatEntryDate(today)}</div>
      {initialText === null ? (
        <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
      ) : (
        <ReflectionEditor key={today} date={today} initialText={initialText} saveEntry={saveEntry} />
      )}
    </div>
  );
}

function PastEntryRow({ entry, saveEntry }: {
  entry: { entry_date: string; raw_text: string };
  saveEntry: SaveEntryFn;
}) {
  const [expanded, setExpanded] = useState(false);
  const [freshText, setFreshText] = useState<string | null>(null);

  const expand = () => {
    setExpanded(true);
    fetchEntryFresh(entry.entry_date).then((e) => setFreshText(e.raw_text));
  };

  const preview = entry.raw_text.length > 150 ? `${entry.raw_text.slice(0, 150)}…` : entry.raw_text;

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid rgba(17,17,17,.06)' }}>
      <div style={{ font: "700 13px 'Inter Tight', sans-serif", color: '#9a7a2e', marginBottom: 6 }}>
        {formatEntryDate(entry.entry_date)}
      </div>
      {!expanded ? (
        <div
          onClick={expand}
          style={{ font: "500 14px 'Inter Tight', sans-serif", color: '#111', whiteSpace: 'pre-wrap', cursor: 'pointer' }}
        >
          {preview || <span style={{ color: 'rgba(17,17,17,.35)' }}>(empty — click to write)</span>}
        </div>
      ) : freshText === null ? (
        <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
      ) : (
        <ReflectionEditor key={entry.entry_date} date={entry.entry_date} initialText={freshText} saveEntry={saveEntry} />
      )}
    </div>
  );
}

export default function ReflectionsBoard() {
  const { data, saveEntry } = useReflections();
  const pastEntries = data ? data.entries.filter((e) => e.entry_date !== data.today) : [];

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '32px 16px 56px', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '32px 24px 28px',
      }}>
        <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', marginBottom: 28 }}>
          Reflections
        </div>

        {!data && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
        )}

        {data && (
          <>
            <TodayCard today={data.today} saveEntry={saveEntry} />
            {pastEntries.length === 0 ? (
              <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
                No past reflections yet — write today&apos;s above, or send one via Telegram.
              </div>
            ) : (
              <div>
                {pastEntries.map((entry) => (
                  <PastEntryRow key={entry.entry_date} entry={entry} saveEntry={saveEntry} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
