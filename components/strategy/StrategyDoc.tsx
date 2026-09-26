'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownContent from '@/components/skills/MarkdownContent';
import { extractSections } from '@/lib/strategyDocs';
import { useStrategyDoc, type StrategyVersion } from '@/lib/useStrategyDoc';

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
});
const fmt = (iso: string) => DATE_TIME.format(new Date(iso));

const UNSAVED = 'You have unsaved changes. Leave and lose them?';

type Status = { kind: 'ok' | 'err'; text: string } | null;

function SectionList({ sections, onPick }: { sections: { level: 2 | 3; text: string }[]; onPick: (i: number) => void }) {
  // An H3 is indented only once an H2 has appeared above it, so a sheet made
  // of H3 sections (like Target Audience) does not look upside down.
  return (
    <ul className="strategy-side-list">
      {sections.map((s, i) => {
        const level = s.level === 3 && sections.slice(0, i).some((x) => x.level === 2) ? 3 : 2;
        return (
          <li key={i}>
            <button type="button" className="strategy-side-link" data-level={level} onClick={() => onPick(i)}>{s.text}</button>
          </li>
        );
      })}
    </ul>
  );
}

export default function StrategyDoc({ slug, onDirtyChange }: { slug: string; onDirtyChange?: (dirty: boolean) => void }) {
  const { doc, versions, loading, error, save, fetchVersion } = useStrategyDoc(slug);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [preview, setPreview] = useState<StrategyVersion | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const dirty = mode === 'edit' && doc !== null && draft !== doc.content;
  const sections = useMemo(() => extractSections(doc?.content ?? ''), [doc?.content]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  // Warn before leaving with edits: closing or refreshing the tab, clicking any
  // in-app link (top menu tabs), or using the phone menu dropdown.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return;
      if (!window.confirm(UNSAVED)) { e.preventDefault(); e.stopPropagation(); }
    };
    const onChange = (e: Event) => {
      const sel = e.target as HTMLSelectElement | null;
      if (!sel || !sel.closest?.('#app-top-rail')) return;
      if (!window.confirm(UNSAVED)) { e.stopImmediatePropagation(); sel.value = window.location.pathname; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('click', onClick, true);
    window.addEventListener('change', onChange, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('change', onChange, true);
    };
  }, [dirty]);

  if (loading) return <Card><div className="strategy-muted">Loading&hellip;</div></Card>;
  if (error || !doc) return <Card><div role="alert" style={errBox}>{error ?? 'Not found'}</div></Card>;

  const jump = (i: number) => {
    const el = bodyRef.current?.querySelectorAll('h2, h3')[i];
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (el) el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    setSectionsOpen(false);
  };

  const startEdit = () => {
    setDraft(doc.content);
    setStatus(null);
    setShowVersions(false);
    setPreview(null);
    setMode('edit');
  };

  const cancel = () => {
    if (dirty && !window.confirm('Throw away your unsaved changes?')) return;
    setStatus(null);
    setMode('read');
  };

  const doSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const unchanged = await save(draft);
      setStatus({ kind: 'ok', text: unchanged ? 'No changes to save.' : 'Saved.' });
      setMode('read');
    } catch (e) {
      setStatus({ kind: 'err', text: `Not saved. ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  const openVersion = async (id: string) => {
    setPreviewBusy(true);
    setStatus(null);
    try {
      setPreview(await fetchVersion(id));
    } catch (e) {
      setPreview(null);
      setStatus({ kind: 'err', text: (e as Error).message });
    } finally {
      setPreviewBusy(false);
    }
  };

  const restore = async () => {
    if (!preview) return;
    if (!window.confirm(`Restore the version from ${fmt(preview.saved_at)}? The text you have now stays in Older versions.`)) return;
    setSaving(true);
    setStatus(null);
    try {
      await save(preview.content);
      setPreview(null);
      setStatus({ kind: 'ok', text: 'Restored. The text you replaced is in Older versions.' });
    } catch (e) {
      setStatus({ kind: 'err', text: `Not restored. ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ font: "800 clamp(22px, 5vw, 28px) 'Archivo', sans-serif", letterSpacing: '-0.02em', color: '#111', margin: 0, lineHeight: 1.2 }}>
            {doc.title}
          </h1>
          <div style={{ font: "600 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.55)', marginTop: 6 }}>
            Last edited {fmt(doc.updated_at)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {mode === 'read' ? (
            <>
              <button type="button" className="strategy-btn strategy-btn-secondary" onClick={() => { setShowVersions((v) => !v); setPreview(null); }} aria-expanded={showVersions}>
                Older versions{versions.length > 0 ? ` (${versions.length})` : ''}
              </button>
              <button type="button" className="strategy-btn strategy-btn-primary" onClick={startEdit}>Edit</button>
            </>
          ) : (
            <>
              {dirty && <span style={{ font: "700 12px 'Inter Tight', sans-serif", color: '#7a5f22' }}>Unsaved changes</span>}
              <button type="button" className="strategy-btn strategy-btn-secondary" onClick={cancel} disabled={saving}>Cancel</button>
              <button type="button" className="strategy-btn strategy-btn-primary" onClick={doSave} disabled={!dirty || saving || !draft.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      <div role="status" aria-live="polite" style={{ minHeight: 20, marginTop: 10 }}>
        {status && (
          <span style={{ font: "600 13px 'Inter Tight', sans-serif", color: status.kind === 'ok' ? '#2f6b34' : '#b3261e' }}>{status.text}</span>
        )}
      </div>

      {showVersions && mode === 'read' && (
        <div style={{ border: '1px solid rgba(17,17,17,.12)', borderRadius: 8, background: '#fff', padding: 16, margin: '8px 0 20px' }}>
          <div style={{ font: "700 14px 'Inter Tight', sans-serif", color: '#111' }}>Older versions</div>
          <p style={{ font: "500 12.5px/1.5 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)', margin: '4px 0 12px' }}>
            Each entry is the text as it was before a save. Restoring one saves it as a new edit and keeps the current text here too.
          </p>
          {versions.length === 0 ? (
            <div className="strategy-muted">No older versions yet. One is kept every time you save.</div>
          ) : (
            <div className="strategy-versions-grid">
              <ul className="strategy-side-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {versions.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button" className="strategy-side-link" onClick={() => openVersion(v.id)}
                      style={preview?.id === v.id ? { background: 'rgba(2,74,221,.1)', color: '#024ADD' } : undefined}
                    >
                      {fmt(v.saved_at)}
                    </button>
                  </li>
                ))}
              </ul>
              <div>
                {previewBusy && <div className="strategy-muted">Loading&hellip;</div>}
                {!previewBusy && !preview && <div className="strategy-muted">Pick a date to preview that version.</div>}
                {!previewBusy && preview && (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                      <span style={{ font: "700 13px 'Inter Tight', sans-serif" }}>Version from {fmt(preview.saved_at)}</span>
                      <button type="button" className="strategy-btn strategy-btn-primary" onClick={restore} disabled={saving}>Restore this version</button>
                    </div>
                    <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid rgba(17,17,17,.1)', borderRadius: 8, padding: '12px 16px' }}>
                      <MarkdownContent content={preview.content} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'edit' ? (
        <textarea
          className="strategy-textarea" aria-label={`${doc.title}, Markdown text`}
          value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false}
        />
      ) : (
        <div className={sections.length > 0 ? 'strategy-layout' : 'strategy-layout-single'} style={{ marginTop: 8 }}>
          {sections.length > 0 && (
            <>
              <nav className="strategy-side" aria-label="Sections">
                <p className="strategy-side-title">Sections</p>
                <SectionList sections={sections} onPick={jump} />
              </nav>
              <details className="strategy-side-mobile" open={sectionsOpen} onToggle={(e) => setSectionsOpen((e.currentTarget as HTMLDetailsElement).open)}>
                <summary>Sections ({sections.length})</summary>
                <SectionList sections={sections} onPick={jump} />
              </details>
            </>
          )}
          <div ref={bodyRef} style={{ minWidth: 0 }}>
            <MarkdownContent content={doc.content} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="strategy-card">{children}</div>;
}

const errBox: React.CSSProperties = {
  background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
  padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
};
