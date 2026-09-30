'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { loadStoredImages } from '@/lib/boardImagesClient';
import { downloadTextFile } from '@/lib/downloadText';
import MarkdownContent from '@/components/skills/MarkdownContent';
import { CONTENT_ITEM_TYPES, CONTENT_ITEM_TYPE_LABELS, STAGE_OPTIONS, STATUS_OPTIONS, type ContentItemType } from '@/lib/types';
import type { SharedCmsItem } from '@/lib/shares';

const ExcalidrawViewer = dynamic(() => import('@/components/boards/ExcalidrawViewer'), {
  ssr: false,
  loading: () => <div style={muted}>Loading&hellip;</div>,
});

type Shared =
  | { type: 'sop'; title: string; version: string; version_date: string; content: string }
  | { type: 'skill'; title: string; version: string; version_date: string; content: string }
  | { type: 'board'; title: string; scene: { files: Record<string, unknown> } }
  | { type: 'cms'; title: string; items: SharedCmsItem[] };

// Shared with SkillDetail's downloadSkill via lib/downloadText, so
// downloaded filenames and mobile-download behaviour stay consistent
// app-wide. The public page already has `content` client side (it's what's
// rendered), so no fetch is needed.
function downloadShared(item: { title: string; version: string; content: string }) {
  downloadTextFile(`${item.title}-v${item.version}.md`, item.content);
}

// The public page for a share link: one item, read only, no app chrome.
export default function SharedView({ token }: { token: string }) {
  const [item, setItem] = useState<Shared | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'password'>('loading');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function load(live: () => boolean) {
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (res.status === 401) {
        const body = await res.json().catch(() => null) as { password_required?: boolean } | null;
        if (live() && body?.password_required) { setState('password'); return; }
        throw new Error('unavailable');
      }
      if (!res.ok) throw new Error('unavailable');
      const data = await res.json() as Shared;
      if (data.type === 'board') {
        const images = await loadStoredImages('', data.scene.files, new Map(),
          (fileId) => `/api/share/${encodeURIComponent(token)}/images/${encodeURIComponent(fileId)}`);
        data.scene = { ...data.scene, files: images.files };
      }
      if (live()) { setItem(data); setState('ready'); }
    } catch {
      if (live()) setState('unavailable');
    }
  }

  useEffect(() => {
    let alive = true;
    load(() => alive);
    return () => { alive = false; };
  }, [token]);

  async function submitPassword() {
    if (!password || pwBusy) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setPwError(body?.error === 'incorrect password' ? 'Wrong password, try again.' : 'Something went wrong.');
        return;
      }
      setState('loading');
      await load(() => true);
    } finally {
      setPwBusy(false);
    }
  }

  if (state === 'loading') return <Centered><div style={muted}>Loading&hellip;</div></Centered>;

  if (state === 'password') {
    return (
      <Centered>
        <div style={{ width: 'min(320px, 90vw)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ font: "700 16px 'Inter Tight', sans-serif", color: '#111' }}>This link is password protected</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPassword(); }}
            placeholder="Password"
            autoFocus
            className="tap-44"
            style={{ font: "500 14px 'Inter Tight', sans-serif", padding: '10px 12px', border: '1px solid rgba(17,17,17,.18)', borderRadius: 8 }}
          />
          {pwError && <div style={{ font: "500 12.5px 'Inter Tight', sans-serif", color: '#b3261e' }}>{pwError}</div>}
          <button
            onClick={submitPassword}
            disabled={pwBusy || !password}
            className="tap-44"
            style={{
              font: "700 13px 'Inter Tight', sans-serif", color: '#fff', background: '#024ADD', border: 'none',
              borderRadius: 8, padding: '10px 16px', cursor: pwBusy ? 'default' : 'pointer', opacity: pwBusy || !password ? 0.6 : 1,
            }}
          >
            {pwBusy ? 'Checking…' : 'View'}
          </button>
        </div>
      </Centered>
    );
  }

  if (state === 'unavailable' || !item) {
    return <Centered><div style={{ font: "600 15px 'Inter Tight', sans-serif", color: '#111' }}>This link isn&apos;t available.</div></Centered>;
  }

  if (item.type === 'sop' || item.type === 'skill') {
    return (
      <div style={{ width: '96%', maxWidth: 1000, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
        <div style={{
          background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
          boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', margin: 0 }}>{item.title}</h1>
            <button onClick={() => downloadShared(item)} style={btnSecondary}>Download</button>
          </div>
          <div style={{ font: "600 12.5px 'Inter Tight', sans-serif", color: 'var(--ink-3)', margin: '4px 0 18px' }}>
            v{item.version} &middot; {item.version_date}
          </div>
          {item.content.trim()
            ? <MarkdownContent content={item.content} />
            : <div style={muted}>Nothing written yet.</div>}
        </div>
      </div>
    );
  }

  if (item.type === 'cms') {
    return <SharedCms items={item.items} token={token} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 20px', borderBottom: '1px solid rgba(17,17,17,.08)' }}>
        <h1 style={{
          flex: 1, minWidth: 0, margin: 0, font: "800 18px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.title}
        </h1>
        <span style={{ font: "500 12.5px 'Inter Tight', sans-serif", color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>View only</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ExcalidrawViewer scene={item.scene} />
      </div>
    </div>
  );
}

// Editable view of the whole CMS: every content item grouped by type, in the
// same LF/LTS/SF/Ads/VSL groupings as the app's own board tabs, name and
// stage/status/post date always visible, full content + Stage/Status editing
// on tap. Whoever has this password-verified link can save real changes
// (PATCH /api/share/[token]/content-items/[id]) -- there is no per-editor
// identity behind it, just the shared link+password.
function SharedCms({ items: initialItems, token }: { items: SharedCmsItem[]; token: string }) {
  const [items, setItems] = useState(initialItems);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div style={{ width: '96%', maxWidth: 900, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
      <h1 style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        Content Management System
      </h1>
      <div style={{ ...muted, marginBottom: 24 }}>Anyone with this link can view and edit.</div>
      {CONTENT_ITEM_TYPES.map((type) => {
        const typeItems = items.filter((i) => i.type === type);
        if (typeItems.length === 0) return null;
        return (
          <div key={type} style={{ marginBottom: 28 }}>
            <div style={{
              font: "700 12px 'Inter Tight', sans-serif", letterSpacing: '.04em', textTransform: 'uppercase',
              color: 'rgba(17,17,17,.45)', marginBottom: 10,
            }}>
              {CONTENT_ITEM_TYPE_LABELS[type]}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {typeItems.map((it) => (
                <SharedCmsCard
                  key={it.id}
                  item={it}
                  open={openId === it.id}
                  onToggle={() => setOpenId((cur) => (cur === it.id ? null : it.id))}
                  onSaved={(patch) => setItems((cur) => cur.map((row) => (row.id === it.id ? { ...row, ...patch } : row)))}
                  token={token}
                />
              ))}
            </div>
          </div>
        );
      })}
      {items.length === 0 && <div style={muted}>Nothing here yet.</div>}
    </div>
  );
}

function SharedCmsCard({ item, open, onToggle, onSaved, token }: {
  item: SharedCmsItem;
  open: boolean;
  onToggle: () => void;
  onSaved: (patch: Partial<SharedCmsItem>) => void;
  token: string;
}) {
  const [bodyDraft, setBodyDraft] = useState(item.body_md);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  useEffect(() => { setBodyDraft(item.body_md); }, [item.body_md]);

  async function save(patch: Partial<Pick<SharedCmsItem, 'body_md' | 'stage' | 'status'>>) {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}/content-items/${item.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) { setSaveMsg('Save failed, try again.'); return; }
      onSaved(patch);
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(null), 1500);
    } catch {
      setSaveMsg('Save failed, try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, padding: '12px 16px' }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}
      >
        <div style={{ font: "600 14px 'Inter Tight', sans-serif", color: '#111' }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            font: "600 10.5px 'Inter Tight', sans-serif", color: '#024ADD', background: 'rgba(2,74,221,.08)',
            padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap',
          }}>{item.stage}</span>
          {item.post_date && (
            <span style={{ font: "500 11.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.45)', whiteSpace: 'nowrap' }}>
              {new Date(`${item.post_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(17,17,17,.08)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 140px' }}>
              <span style={fieldLabel}>Stage</span>
              <select
                value={item.stage}
                onChange={(e) => save({ stage: e.target.value })}
                style={sharedFieldStyle}
              >
                {STAGE_OPTIONS[item.type as ContentItemType].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ flex: '1 1 140px' }}>
              <span style={fieldLabel}>Status</span>
              <select
                value={item.status ?? ''}
                onChange={(e) => save({ status: e.target.value })}
                style={sharedFieldStyle}
              >
                {STATUS_OPTIONS[item.type as ContentItemType].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <span style={fieldLabel}>Content</span>
          <textarea
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            onBlur={() => { if (bodyDraft !== item.body_md) save({ body_md: bodyDraft }); }}
            rows={12}
            style={{ ...sharedFieldStyle, resize: 'vertical', fontFamily: "'Inter Tight', sans-serif", lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            {saving && <span style={muted}>Saving…</span>}
            {saveMsg && <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: saveMsg === 'Saved.' ? '#3a9d5d' : '#b3261e' }}>{saveMsg}</span>}
          </div>
          {!bodyDraft.trim() && (
            <div style={{ ...muted, marginTop: 8 }}>Preview:</div>
          )}
          {bodyDraft.trim() && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(17,17,17,.1)' }}>
              <div style={{ ...fieldLabel, marginBottom: 8, display: 'block' }}>Preview</div>
              <MarkdownContent content={bodyDraft} breaks />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.5)',
  letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
};
const sharedFieldStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid rgba(17,17,17,.1)',
  borderRadius: 6, background: '#fff', boxSizing: 'border-box',
  fontFamily: "'Inter Tight', sans-serif", fontSize: 14, color: '#111', outline: 'none',
};

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>{children}</div>;
}

const muted: React.CSSProperties = { font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)' };
const btnSecondary: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
  background: '#fff', color: '#111', border: '1px solid rgba(17,17,17,.15)', whiteSpace: 'nowrap', flexShrink: 0,
};
