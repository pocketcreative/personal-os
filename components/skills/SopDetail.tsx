'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchSop, saveSop } from '@/lib/useSops';
import { useSkills } from '@/lib/useSkills';
import { renderSopExport, sopEmDashWarning, sopFileName } from '@/lib/sopMarkdown';
import { SOP_PROGRESS, SOP_PROGRESS_COLORS, SOP_PROGRESS_LABELS, SOP_SYSTEMS, type Sop, type SopProgress, type SopSystem } from '@/lib/types';
import MarkdownContent from './MarkdownContent';

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

function downloadSop(sop: Sop) {
  const blob = new Blob([renderSopExport(sop)], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sopFileName(sop);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Real headers, not greyed placeholder text: opening Edit on an empty SOP
// pre-fills these so they're permanent text Brendan writes under.
const SOP_TEMPLATE = '## Goal\n\n## Principles\n\n## Steps\n\n## Example\n\n## Checklist\n';

const sectionLabel: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", color: '#111', marginBottom: 6, marginTop: 18,
};
const btnBase: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer', border: '1px solid transparent',
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: '#024ADD', color: '#fff' };
const btnSecondary: React.CSSProperties = { ...btnBase, background: '#fff', color: '#111', border: '1px solid rgba(17,17,17,.15)' };

export default function SopDetail({ id }: { id: string }) {
  const [sop, setSop] = useState<Sop | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // Same read/edit toggle as SkillDetail: read (rendered markdown) is the
  // default, edit (raw textarea) is an explicit switch. Only governs the
  // content box -- title/progress/systems/linked skill stay always-editable
  // the way they already were, per Brendan's instruction to leave those
  // fields exactly as they are.
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const { skills } = useSkills();

  useEffect(() => {
    let live = true;
    fetchSop(id)
      .then((s) => { if (live) { setSop(s); setDraft(toDraft(s)); setLoading(false); } })
      .catch((e) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; };
  }, [id]);

  const activeSkills = useMemo(
    () => [...skills].filter((s) => s.status === 'active').sort((a, b) => a.slug.localeCompare(b.slug)),
    [skills],
  );

  if (loading) return <Wrap><div style={muted}>Loading&hellip;</div></Wrap>;
  if (error || !sop || !draft) return <Wrap><div style={errStyle}>{error ?? 'Not found'}</div></Wrap>;

  const dirty = isDirty(draft, sop);
  const linkedSkillSlug = sop.skill_id ? skills.find((s) => s.id === sop.skill_id)?.slug ?? null : null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const toggleSystem = (sys: SopSystem) => {
    setDraft((d) => {
      if (!d) return d;
      const has = d.systems.includes(sys);
      return { ...d, systems: has ? d.systems.filter((s) => s !== sys) : [...d.systems, sys] };
    });
  };

  const save = async () => {
    if (!draft) return;
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
      setSaveMsg(`Saved as v${updated.version}.`);
      window.dispatchEvent(new Event('sops:refresh'));
    } catch (e) {
      setSaveMsg((e as Error).message);
    } finally {
      setSaving(false);
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
        <button onClick={() => downloadSop(sop)} style={btnSecondary}>Download as MD</button>
        {mode === 'read' && (
          <button onClick={() => { if (!draft.content.trim()) set('content', SOP_TEMPLATE); setMode('edit'); }} style={btnSecondary}>Edit</button>
        )}
        {mode === 'edit' && (
          <button onClick={() => setMode('read')} style={btnSecondary}>Done editing</button>
        )}
        <button onClick={save} disabled={!dirty || saving} style={{ ...btnPrimary, opacity: !dirty || saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saveMsg && <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: saveMsg.startsWith('Saved') ? '#4b7a4f' : '#b3261e' }}>{saveMsg}</span>}
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
      {mode === 'edit' ? (
        <textarea
          value={draft.content}
          onChange={(e) => set('content', e.target.value)}
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box', minHeight: '60vh', resize: 'vertical',
            fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6, color: '#111',
            padding: '16px 18px', border: '1px solid rgba(17,17,17,.14)', borderRadius: 8, background: '#fff',
            outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}
        />
      ) : (
        <div style={{
          width: '100%', boxSizing: 'border-box',
          padding: '20px 24px', border: '1px solid rgba(17,17,17,.1)', borderRadius: 8, background: '#fff',
        }}>
          {/* Reads from `draft`, not `sop.content`: if there are unsaved
              edits (dirty), the read view reflects them instead of silently
              discarding what hasn't been saved yet when toggling modes. */}
          {draft.content.trim() ? (
            <MarkdownContent content={draft.content} />
          ) : (
            <div style={muted}>Nothing written yet. Click Edit to add Goal / Principles / Steps / Example / Checklist.</div>
          )}
        </div>
      )}
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
