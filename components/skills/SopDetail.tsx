'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchSop, saveSop } from '@/lib/useSops';
import { useSkills } from '@/lib/useSkills';
import { renderSopExport, sopEmDashWarning, sopFileName } from '@/lib/sopMarkdown';
import { SOP_SYSTEMS, type Sop, type SopSystem } from '@/lib/types';

type Draft = {
  title: string; goal: string; principles: string; steps: string;
  example: string; checklist: string; systems: SopSystem[]; skill_id: string | null;
};

function toDraft(sop: Sop): Draft {
  return {
    title: sop.title, goal: sop.goal, principles: sop.principles, steps: sop.steps,
    example: sop.example ?? '', checklist: sop.checklist, systems: sop.systems, skill_id: sop.skill_id,
  };
}

function isDirty(draft: Draft, sop: Sop): boolean {
  return draft.title !== sop.title || draft.goal !== sop.goal || draft.principles !== sop.principles
    || draft.steps !== sop.steps || draft.example !== (sop.example ?? '') || draft.checklist !== sop.checklist
    || JSON.stringify(draft.systems) !== JSON.stringify(sop.systems) || draft.skill_id !== sop.skill_id;
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

const sectionLabel: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", color: '#111', marginBottom: 6, marginTop: 18,
};
const textareaStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 100, resize: 'vertical',
  font: "500 13.5px 'Inter Tight', sans-serif", lineHeight: 1.6, color: '#111',
  padding: '12px 14px', border: '1px solid rgba(17,17,17,.14)', borderRadius: 8, background: '#fff', outline: 'none',
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
        title: draft.title, goal: draft.goal, principles: draft.principles, steps: draft.steps,
        example: draft.example.trim() ? draft.example : null, checklist: draft.checklist,
        systems: draft.systems, skill_id: draft.skill_id,
      }, sop.updated_at);
      setSop(updated);
      setDraft(toDraft(updated));
      setWarning(sopEmDashWarning(draft));
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

      <div style={sectionLabel}>Goal</div>
      <textarea value={draft.goal} onChange={(e) => set('goal', e.target.value)} style={textareaStyle} placeholder="What this process is for." />

      <div style={sectionLabel}>Principles</div>
      <textarea value={draft.principles} onChange={(e) => set('principles', e.target.value)} style={textareaStyle} placeholder="The rules/judgment calls behind the steps." />

      <div style={sectionLabel}>Steps</div>
      <textarea value={draft.steps} onChange={(e) => set('steps', e.target.value)} style={{ ...textareaStyle, minHeight: 160 }} placeholder="The actual step-by-step process." />

      <div style={sectionLabel}>Example</div>
      <textarea value={draft.example} onChange={(e) => set('example', e.target.value)} style={textareaStyle} placeholder="A real worked example. Left blank until you fill it in -- the downloaded file leaves this heading out entirely while it's empty." />

      <div style={sectionLabel}>Checklist</div>
      <textarea value={draft.checklist} onChange={(e) => set('checklist', e.target.value)} style={textareaStyle} placeholder={'- [ ] First check\n- [ ] Second check'} />
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
