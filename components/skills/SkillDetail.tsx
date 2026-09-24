'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchSkill, saveSkillContent } from '@/lib/useSkills';
import { readTrigger } from '@/lib/skillFile';
import { SKILL_SOURCE_LABELS, type Skill } from '@/lib/types';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchSkill(slug)
      .then((s) => { if (live) { setSkill(s); setDraft(s.content); setLoading(false); } })
      .catch((e) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; };
  }, [slug]);

  if (loading) return <Wrap><div style={muted}>Loading&hellip;</div></Wrap>;
  if (error || !skill) return <Wrap><div style={errStyle}>{error ?? 'Not found'}</div></Wrap>;

  const editable = skill.source === 'brendan';
  const dirty = editable && draft !== skill.content;
  const trigger = readTrigger(skill.content);

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await saveSkillContent(skill.slug, draft, skill.updated_at);
      setSkill(updated);
      setDraft(updated.content);
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
            href={editable ? '/skills' : '/skills/library'}
            style={{ font: "600 12px 'Inter Tight', sans-serif", color: '#9a7a2e', textDecoration: 'none' }}
          >
            &larr; {editable ? 'Skills' : 'Skills Library'}
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
        {editable && (
          <button onClick={save} disabled={!dirty || saving} style={{ ...btnPrimary, opacity: !dirty || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
        {saveMsg && <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: saveMsg.startsWith('Saved') ? '#4b7a4f' : '#b3261e' }}>{saveMsg}</span>}
      </div>

      {warning && (
        <div style={{
          background: 'rgba(154,122,46,.08)', border: '1px solid rgba(154,122,46,.3)', borderRadius: 8,
          padding: '10px 14px', font: "500 12.5px 'Inter Tight', sans-serif", color: '#7a5f22', marginBottom: 14,
        }}>
          {warning}
        </div>
      )}

      {editable ? (
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
        <pre style={{
          width: '100%', boxSizing: 'border-box', margin: 0, overflowX: 'auto',
          fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.6, color: '#111',
          padding: '16px 18px', border: '1px solid rgba(17,17,17,.1)', borderRadius: 8, background: '#fff',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {skill.content}
        </pre>
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
const btnBase: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer', border: '1px solid transparent',
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: '#024ADD', color: '#fff' };
const btnSecondary: React.CSSProperties = { ...btnBase, background: '#fff', color: '#111', border: '1px solid rgba(17,17,17,.15)' };
