'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchSkill, saveSkillContent } from '@/lib/useSkills';
import { readTrigger, stripFrontmatter } from '@/lib/skillFile';
import { SKILL_SOURCE_LABELS, SOP_SYSTEMS, type Skill, type SopSystem } from '@/lib/types';
import MarkdownContent from './MarkdownContent';

function downloadSkill(skill: Skill) {
  // Skills are stored verbatim, so the download IS the stored content --
  // no template transformation, unlike the (not-yet-built) SOP export.
  const blob = new Blob([skill.content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${skill.slug}-v${skill.version}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SkillDetail({ slug }: { slug: string }) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [draft, setDraft] = useState('');
  const [systemsDraft, setSystemsDraft] = useState<SopSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // A skill Brendan owns (source: 'brendan') used to render permanently as
  // an editable textarea -- fine for editing, unreadable for the much more
  // common case of just reading it. Read is now the default; Edit is an
  // explicit switch, matching how library (non-editable) skills already
  // only ever showed the formatted read view.
  const [mode, setMode] = useState<'read' | 'edit'>('read');

  useEffect(() => {
    let live = true;
    fetchSkill(slug)
      .then((s) => { if (live) { setSkill(s); setDraft(s.content); setSystemsDraft(s.systems ?? []); setLoading(false); } })
      .catch((e) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; };
  }, [slug]);

  if (loading) return <Wrap><div style={muted}>Loading&hellip;</div></Wrap>;
  if (error || !skill) return <Wrap><div style={errStyle}>{error ?? 'Not found'}</div></Wrap>;

  // Fix 3: claude.ai-owned skills are editable here too now (Brendan's
  // reasoning: he directs all of it, even the claude.ai-managed ones).
  // Vendor skills stay read-only -- see the inline note below and the
  // server-side guard in app/api/skills/[slug]/route.ts.
  const editable = skill.source === 'brendan' || skill.source === 'claude_ai';
  const contentDirty = editable && draft !== skill.content;
  const systemsDirty = JSON.stringify(systemsDraft) !== JSON.stringify(skill.systems ?? []);
  const dirty = contentDirty || systemsDirty;
  const toggleSystem = (sys: SopSystem) => {
    setSystemsDraft((prev) => (prev.includes(sys) ? prev.filter((s) => s !== sys) : [...prev, sys]));
  };
  const trigger = readTrigger(skill.content);

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await saveSkillContent(skill.slug, draft, skill.updated_at, systemsDirty ? systemsDraft : undefined);
      setSkill(updated);
      setDraft(updated.content);
      setSystemsDraft(updated.systems ?? []);
      setWarning(updated.warning);
      setSaveMsg(`Saved as v${updated.version}.`);
      window.dispatchEvent(new Event('skills:refresh'));
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
          <Link
            href={`/skills?filter=${skill.source}`}
            style={{ font: "600 12px 'Inter Tight', sans-serif", color: '#9a7a2e', textDecoration: 'none' }}
          >
            &larr; Skills
          </Link>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', marginTop: 4 }}>
            {skill.slug}
          </div>
        </div>
        <span style={{
          font: "700 11px 'Archivo', sans-serif", color: '#9a7a2e',
          background: 'rgba(154,122,46,.10)', borderRadius: 20, padding: '4px 10px', whiteSpace: 'nowrap',
        }}>
          {SKILL_SOURCE_LABELS[skill.source]}
        </span>
      </div>

      <div style={{ font: "600 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.45)', marginBottom: 4 }}>
        v{skill.version} &middot; {skill.version_date}
        {skill.sync_to_local && (
          <> &middot; {skill.last_synced_at ? `last synced ${new Date(skill.last_synced_at).toLocaleString()}` : 'not yet synced'}</>
        )}
      </div>

      {trigger && (
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)', marginBottom: 20, maxWidth: 720 }}>
          {trigger}
        </div>
      )}
      {!trigger && (
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: '#b3261e', marginBottom: 20 }}>
          No trigger description found in this file&apos;s frontmatter.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => downloadSkill(skill)} style={btnSecondary}>Download as MD</button>
        {editable && mode === 'read' && (
          <button onClick={() => setMode('edit')} style={btnSecondary}>Edit</button>
        )}
        {editable && mode === 'edit' && (
          <button onClick={() => setMode('read')} style={btnSecondary}>Done editing</button>
        )}
        {((editable && mode === 'edit') || systemsDirty) && (
          <>
            <button onClick={save} disabled={!dirty || saving} style={{ ...btnPrimary, opacity: !dirty || saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
        {saveMsg && <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: saveMsg.startsWith('Saved') ? '#4b7a4f' : '#b3261e' }}>{saveMsg}</span>}
      </div>

      <div style={sectionLabel}>System</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {SOP_SYSTEMS.map((sys) => {
          const active = systemsDraft.includes(sys);
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
      <div style={{ font: "500 11.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginTop: 6, marginBottom: 14 }}>
        Optional. Leave blank if this skill doesn&apos;t map to one of the 8 systems.
      </div>

      {skill.source === 'claude_ai' && (
        <div style={{
          background: 'rgba(2,74,221,.05)', border: '1px solid rgba(2,74,221,.25)', borderRadius: 8,
          padding: '10px 14px', font: "500 12.5px 'Inter Tight', sans-serif", color: '#024ADD', marginBottom: 14, maxWidth: 720,
        }}>
          Editing here updates this reference copy only. It does not change your actual claude.ai skill, and a future sync from your account may overwrite this.
        </div>
      )}

      {warning && (
        <div style={{
          background: 'rgba(154,122,46,.08)', border: '1px solid rgba(154,122,46,.3)', borderRadius: 8,
          padding: '10px 14px', font: "500 12.5px 'Inter Tight', sans-serif", color: '#7a5f22', marginBottom: 14,
        }}>
          {warning}
        </div>
      )}

      {editable && mode === 'edit' ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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
          {/* Reads from `draft`, not `skill.content`: if there are unsaved
              edits (dirty), the read view reflects them instead of silently
              discarding what hasn't been saved yet when toggling modes. */}
          <MarkdownContent content={stripFrontmatter(draft)} />
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
const sectionLabel: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", color: '#111', marginBottom: 6, marginTop: 4,
};
const btnBase: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer', border: '1px solid transparent',
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: '#024ADD', color: '#fff' };
const btnSecondary: React.CSSProperties = { ...btnBase, background: '#fff', color: '#111', border: '1px solid rgba(17,17,17,.15)' };
