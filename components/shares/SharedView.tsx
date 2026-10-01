'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { loadStoredImages } from '@/lib/boardImagesClient';
import { downloadTextFile } from '@/lib/downloadText';
import MarkdownContent from '@/components/skills/MarkdownContent';
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
    // The real entry point for a 'cms' share is /share/[token]/lf (the
    // server-side redirect in app/share/[token]/page.tsx) -- this only
    // renders if that redirect didn't happen for some reason, so it does
    // the same thing client side rather than falling through to the
    // Excalidraw board view below, which this item shape doesn't have.
    if (typeof window !== 'undefined') window.location.replace(`/share/${token}/lf`);
    return <Centered><div style={muted}>Redirecting&hellip;</div></Centered>;
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

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>{children}</div>;
}

const muted: React.CSSProperties = { font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)' };
const btnSecondary: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
  background: '#fff', color: '#111', border: '1px solid rgba(17,17,17,.15)', whiteSpace: 'nowrap', flexShrink: 0,
};
