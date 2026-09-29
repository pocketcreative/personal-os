'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteSop, fetchSop, saveSop, SAVE_CONFLICT_MESSAGE } from '@/lib/useSops';
import { useSkills } from '@/lib/useSkills';
import { renderSopExport, sopEmDashWarning, sopFileName, type SopAudience } from '@/lib/sopMarkdown';
import { SOP_PROGRESS, SOP_PROGRESS_COLORS, SOP_PROGRESS_LABELS, SOP_SYSTEMS, type Sop, type SopProgress, type SopSystem } from '@/lib/types';
import dynamic from 'next/dynamic';
import ShareControl from '@/components/shares/ShareControl';

// Client-only (ProseMirror needs the DOM) and code-split, so the editor's
// weight only loads once someone opens a SOP.
const MarkdownEditor = dynamic(() => import('./MarkdownEditor'), {
  ssr: false,
  loading: () => <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '20px 0' }}>Loading editor&hellip;</div>,
});

// Debounce delay for autosave, matching SkillDetail.
const AUTOSAVE_DELAY_MS = 2000;

type Draft = {
  title: string; content: string; systems: SopSystem[]; skill_id: string | null; progress: SopProgress;
};

function toDraft(sop: Sop): Draft {
  return { title: sop.title, content: sop.content, systems: sop.systems, skill_id: sop.skill_id, progress: sop.progress };
}

function isDirty(draft: Draft, sop: Sop): boolean {
  return draft.title !== sop.title || draft.content !== sop.content
    || JSON.stringify(draft.systems) !== JSON.stringify(sop.systems) || draft.skill_id !== sop.skill_id
    || draft.progress !== sop.progress;
}

function downloadSop(sop: Sop, audience: SopAudience) {
  const blob = new Blob([renderSopExport(sop, audience)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sopFileName(sop, audience);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Real headers, not greyed placeholder text: a brand-new SOP (empty content)
// gets pre-filled with these on load so there's permanent text to write
// under from the start, now that there's no separate Edit click to hang
// this off of.
const SOP_TEMPLATE = '## Goal\n\n## Principles\n\n## Steps\n\n### Step 1\n\n### Step 2\n\n## Example\n\n## Checklist\n';

const sectionLabel: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", color: '#111', marginBottom: 6, marginTop: 18,
};
const btnBase: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer', border: '1px solid transparent',
};
const btnSecondary: React.CSSProperties = { ...btnBase, background: '#fff', color: '#111', border: '1px solid rgba(17,17,17,.15)' };
// Same delete-button convention as ContentDetailModal/TaskDetailModal.
const btnDanger: React.CSSProperties = { ...btnBase, background: 'transparent', color: '#c0392b', border: '1px solid rgba(192,57,43,.3)' };

export default function SopDetail({ id }: { id: string }) {
  const router = useRouter();
  const [sop, setSop] = useState<Sop | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { skills } = useSkills();

  useEffect(() => {
    let live = true;
    fetchSop(id)
      .then((s) => {
        if (!live) return;
        setSop(s);
        // Pre-fill the template on a brand-new (empty) SOP -- see the
        // SOP_TEMPLATE comment above. This is itself just a draft change,
        // so the debounce effect below autosaves it the same as any edit.
        setDraft(toDraft(s.content.trim() ? s : { ...s, content: SOP_TEMPLATE }));
        setLoading(false);
      })
      .catch((e) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; };
  }, [id]);

  const activeSkills = useMemo(
    () => [...skills].filter((s) => s.status === 'active').sort((a, b) => a.slug.localeCompare(b.slug)),
    [skills],
  );

  const dirty = sop !== null && draft !== null && isDirty(draft, sop);

  const save = async () => {
    if (!sop || !draft) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await saveSop(sop.id, {
        title: draft.title, content: draft.content,
        systems: draft.systems, skill_id: draft.skill_id, progress: draft.progress,
      }, sop.updated_at);
      setSop(updated);
      setDraft(toDraft(updated));
      setWarning(sopEmDashWarning({ title: draft.title, content: draft.content }));
      setSaveMsg('Saved.');
      window.dispatchEvent(new Event('sops:refresh'));
    } catch (e) {
      const message = (e as Error).message;
      // Same recovery as SkillDetail: a 409 used to be a dead end under the
      // old manual-Save flow (the message says "reload" but there's no
      // reload control). Refetch instead -- the user's unsaved edits stay
      // in `draft`, only the stale `sop.updated_at` this compares against
      // gets refreshed, and autosave's next debounced attempt (triggered
      // automatically since `dirty` stays true) retries on its own.
      if (message === SAVE_CONFLICT_MESSAGE) {
        try {
          const fresh = await fetchSop(sop.id);
          setSop(fresh);
          setSaveMsg('This changed elsewhere -- reloaded the latest version underneath your edits, retrying save.');
        } catch {
          setSaveMsg(message);
        }
      } else {
        setSaveMsg(message);
      }
    } finally {
      setSaving(false);
    }
  };

  // Debounced autosave, Notion-style: no Save button, this fires ~2s after
  // the user stops typing/toggling anything in `draft` (title, content,
  // progress, systems, or linked skill). Declared before the loading/error
  // early return below (rules of hooks), guarded on `dirty`/`saving`
  // internally instead.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (!dirty || saving) return undefined;
    saveTimer.current = setTimeout(() => { save(); }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, saving]);

  if (loading) return <Wrap><div style={muted}>Loading&hellip;</div></Wrap>;
  if (error || !sop || !draft) return <Wrap><div style={errStyle}>{error ?? 'Not found'}</div></Wrap>;

  const linkedSkillSlug = sop.skill_id ? skills.find((s) => s.id === sop.skill_id)?.slug ?? null : null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const toggleSystem = (sys: SopSystem) => {
    setDraft((d) => {
      if (!d) return d;
      const has = d.systems.includes(sys);
      return { ...d, systems: has ? d.systems.filter((s) => s !== sys) : [...d.systems, sys] };
    });
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${sop.title}"? This archives it and can be restored later, but it leaves the list right away.`)) return;
    setDeleting(true);
    setSaveMsg(null);
    try {
      await deleteSop(sop.id);
      window.dispatchEvent(new Event('sops:refresh'));
      router.push('/skills/sops');
    } catch (e) {
      setSaveMsg((e as Error).message);
      setDeleting(false);
    }
  };

  return (
    <Wrap>
      <div className="board-header" style={{ marginBottom: 4 }}>
        <div>
          <Link href="/skills/sops" style={{ font: "600 12px 'Inter Tight', sans-serif", color: '#024ADD', textDecoration: 'none' }}>
            &larr; SOPs
          </Link>
          <input
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4,
              font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em',
              border: 'none', outline: 'none', padding: 0, background: 'transparent',
            }}
          />
        </div>
      </div>

      <div style={{ font: "600 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.45)', marginBottom: 18 }}>
        v{sop.version} &middot; {sop.version_date}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => downloadSop(sop, 'internal')} style={btnSecondary}>Download (Internal)</button>
        <button onClick={() => downloadSop(sop, 'client')} style={btnSecondary}>Download (Client)</button>
        <ShareControl type="sop" id={sop.id} />
        <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, opacity: deleting ? 0.5 : 1 }}>
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        {(saving || saveMsg) && (
          <span style={{
            font: "500 12px 'Inter Tight', sans-serif",
            color: saving ? 'rgba(17,17,17,.45)' : (saveMsg?.startsWith('Saved') ? '#4b7a4f' : '#b3261e'),
          }}>
            {saving ? 'Saving…' : saveMsg}
          </span>
        )}
      </div>

      {warning && (
        <div style={{
          background: 'rgba(154,122,46,.08)', border: '1px solid rgba(154,122,46,.3)', borderRadius: 8,
          padding: '10px 14px', font: "500 12.5px 'Inter Tight', sans-serif", color: '#7a5f22', marginTop: 8,
        }}>
          {warning}
        </div>
      )}

      <div style={sectionLabel}>Progress</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SOP_PROGRESS.map((p) => {
          const active = draft.progress === p;
          const color = SOP_PROGRESS_COLORS[p];
          return (
            <button
              key={p}
              onClick={() => set('progress', p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                font: "700 11.5px 'Inter Tight', sans-serif", borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
                border: active ? `1px solid ${color}` : '1px solid rgba(17,17,17,.15)',
                background: active ? `${color}18` : '#fff',
                color: active ? color : 'rgba(17,17,17,.6)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              {SOP_PROGRESS_LABELS[p]}
            </button>
          );
        })}
      </div>
      <div style={{ font: "500 11.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginTop: 6 }}>
        Active = you run this day to day. In Progress = content&apos;s here but not yet something you run. Not Started = nothing here yet.
      </div>

      <div style={sectionLabel}>System</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SOP_SYSTEMS.map((sys) => {
          const active = draft.systems.includes(sys);
          return (
            <button
              key={sys}
              onClick={() => toggleSystem(sys)}
              style={{
                font: "700 11.5px 'Inter Tight', sans-serif", borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
                border: active ? '1px solid #024ADD' : '1px solid rgba(17,17,17,.15)',
                background: active ? 'rgba(2,74,221,.08)' : '#fff',
                color: active ? '#024ADD' : 'rgba(17,17,17,.6)',
              }}
            >
              {sys}
            </button>
          );
        })}
      </div>
      <div style={{ font: "500 11.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginTop: 6 }}>
        Optional. Leave blank if this SOP doesn&apos;t map to one of the 8 systems.
      </div>

      <div style={sectionLabel}>Linked Skill (optional)</div>
      <select
        value={draft.skill_id ?? ''}
        onChange={(e) => set('skill_id', e.target.value || null)}
        style={{
          width: '100%', boxSizing: 'border-box', font: "500 13px 'Inter Tight', sans-serif", color: '#111',
          padding: '9px 12px', border: '1px solid rgba(17,17,17,.14)', borderRadius: 8, background: '#fff', outline: 'none',
        }}
      >
        <option value="">None -- this is a human-only process</option>
        {activeSkills.map((s) => <option key={s.id} value={s.id}>{s.slug}</option>)}
      </select>
      {linkedSkillSlug && draft.skill_id === sop.skill_id && (
        <div style={{ font: "500 11.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginTop: 6 }}>
          Currently linked to <Link href={`/skills/${encodeURIComponent(linkedSkillSlug)}`} style={{ color: '#024ADD' }}>{linkedSkillSlug}</Link>
        </div>
      )}

      <div style={sectionLabel}>Content</div>
      <MarkdownEditor value={draft.content} onChange={(v) => set('content', v)} />
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '96%', maxWidth: 1000, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
      }}>
        {children}
      </div>
    </div>
  );
}

const muted: React.CSSProperties = { font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' };
const errStyle: React.CSSProperties = {
  background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
  padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
};
