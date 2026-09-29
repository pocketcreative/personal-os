'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { deleteSkill, fetchSkill, saveSkillContent, SAVE_CONFLICT_MESSAGE } from '@/lib/useSkills';
import { readTrigger, stripFrontmatter } from '@/lib/skillFile';
import { SKILL_SOURCE_LABELS, SOP_SYSTEMS, type Skill, type SopSystem } from '@/lib/types';
import { downloadTextFile } from '@/lib/downloadText';
import dynamic from 'next/dynamic';
import MarkdownContent from './MarkdownContent';
import ShareControl from '@/components/shares/ShareControl';

// Client-only (ProseMirror needs the DOM) and code-split, so the editor's
// weight only loads once someone actually opens an editable skill.
const MarkdownEditor = dynamic(() => import('./MarkdownEditor'), {
  ssr: false,
  loading: () => <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '20px 0' }}>Loading editor&hellip;</div>,
});

// Debounce delay for autosave, matching SopDetail.
const AUTOSAVE_DELAY_MS = 2000;

function downloadSkill(skill: Skill) {
  // Skills are stored verbatim, so the download IS the stored content --
  // no template transformation, unlike the (not-yet-built) SOP export.
  // See lib/downloadText for why this isn't a plain Blob+anchor click.
  downloadTextFile(`${skill.slug}-v${skill.version}.md`, skill.content);
}

export default function SkillDetail({ slug }: { slug: string }) {
  const router = useRouter();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [draft, setDraft] = useState('');
  const [systemsDraft, setSystemsDraft] = useState<SopSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    fetchSkill(slug)
      .then((s) => { if (live) { setSkill(s); setDraft(s.content); setSystemsDraft(s.systems ?? []); setLoading(false); } })
      .catch((e) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; };
  }, [slug]);

  // Fix 3: claude.ai-owned skills are editable here too now (Brendan's
  // reasoning: he directs all of it, even the claude.ai-managed ones).
  // Vendor skills stay read-only -- see the inline note below and the
  // server-side guard in app/api/skills/[slug]/route.ts.
  const editable = skill?.source === 'brendan';
  const contentDirty = editable && skill !== null && draft !== skill.content;
  const systemsDirty = skill !== null && JSON.stringify(systemsDraft) !== JSON.stringify(skill.systems ?? []);
  const dirty = contentDirty || systemsDirty;

  const save = async () => {
    if (!skill) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await saveSkillContent(skill.slug, draft, skill.updated_at, systemsDirty ? systemsDraft : undefined);
      setSkill(updated);
      setDraft(updated.content);
      setSystemsDraft(updated.systems ?? []);
      setWarning(updated.warning);
      setSaveMsg('Saved.');
      window.dispatchEvent(new Event('skills:refresh'));
    } catch (e) {
      const message = (e as Error).message;
      // A 409 used to be a dead end under the old manual-Save flow: the
      // error told Brendan to reload, but there was no way to do that short
      // of a manual browser refresh. Refetch here instead -- his unsaved
      // edits in `draft` are untouched, only the stale `skill.updated_at`
      // this compares against gets refreshed, so autosave's next debounced
      // attempt (triggered automatically since `dirty` stays true) goes
      // through without him having to do anything.
      if (message === SAVE_CONFLICT_MESSAGE) {
        try {
          const fresh = await fetchSkill(skill.slug);
          setSkill(fresh);
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
  // the user stops typing content or toggling System tags. Declared before
  // the loading/error early return below (rules of hooks), guarded on
  // `dirty`/`saving` internally instead.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (!dirty || saving) return undefined;
    saveTimer.current = setTimeout(() => { save(); }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, systemsDraft, dirty, saving]);

  if (loading) return <Wrap><div style={muted}>Loading&hellip;</div></Wrap>;
  if (error || !skill) return <Wrap><div style={errStyle}>{error ?? 'Not found'}</div></Wrap>;

  const toggleSystem = (sys: SopSystem) => {
    setSystemsDraft((prev) => (prev.includes(sys) ? prev.filter((s) => s !== sys) : [...prev, sys]));
  };
  const trigger = readTrigger(skill.content);

  const handleDelete = async () => {
    if (!confirm(`Delete "${skill.slug}"? This archives it and can be restored later, but it leaves the list right away.`)) return;
    setDeleting(true);
    setSaveMsg(null);
    try {
      await deleteSkill(skill.slug);
      window.dispatchEvent(new Event('skills:refresh'));
      router.push('/skills');
    } catch (e) {
      setSaveMsg((e as Error).message);
      setDeleting(false);
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
        <ShareControl type="skill" id={skill.id} />
        {editable && (
          <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, opacity: deleting ? 0.5 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
        {(saving || saveMsg) && (
          <span style={{
            font: "500 12px 'Inter Tight', sans-serif",
            color: saving ? 'rgba(17,17,17,.45)' : (saveMsg?.startsWith('Saved') ? '#4b7a4f' : '#b3261e'),
          }}>
            {saving ? 'Saving…' : saveMsg}
          </span>
        )}
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


      {warning && (
        <div style={{
          background: 'rgba(154,122,46,.08)', border: '1px solid rgba(154,122,46,.3)', borderRadius: 8,
          padding: '10px 14px', font: "500 12.5px 'Inter Tight', sans-serif", color: '#7a5f22', marginBottom: 14,
        }}>
          {warning}
        </div>
      )}

      {editable ? (
        <MarkdownEditor value={draft} onChange={setDraft} />
      ) : (
        <div style={{
          width: '100%', boxSizing: 'border-box',
          padding: '20px 24px', border: '1px solid rgba(17,17,17,.1)', borderRadius: 8, background: '#fff',
        }}>
          {/* Vendor/claude.ai-managed skills aren't editable here, so this
              always reads from `skill.content` (draft mirrors it 1:1). */}
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
const btnSecondary: React.CSSProperties = { ...btnBase, background: '#fff', color: '#111', border: '1px solid rgba(17,17,17,.15)' };
// Same delete-button convention as ContentDetailModal/TaskDetailModal.
const btnDanger: React.CSSProperties = { ...btnBase, background: 'transparent', color: '#c0392b', border: '1px solid rgba(192,57,43,.3)' };
