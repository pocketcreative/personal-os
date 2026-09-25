'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { loadStoredImages } from '@/lib/boardImagesClient';
import MarkdownContent from '@/components/skills/MarkdownContent';

const ExcalidrawViewer = dynamic(() => import('@/components/boards/ExcalidrawViewer'), {
  ssr: false,
  loading: () => <div style={muted}>Loading&hellip;</div>,
});

type Shared =
  | { type: 'sop'; title: string; version: string; version_date: string; content: string }
  | { type: 'skill'; title: string; version: string; version_date: string; content: string }
  | { type: 'board'; title: string; scene: { files: Record<string, unknown> } };

// The public page for a share link: one item, read only, no app chrome.
export default function SharedView({ token }: { token: string }) {
  const [item, setItem] = useState<Shared | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('unavailable');
        const data = await res.json() as Shared;
        if (data.type === 'board') {
          const images = await loadStoredImages('', data.scene.files, new Map(),
            (fileId) => `/api/share/${encodeURIComponent(token)}/images/${encodeURIComponent(fileId)}`);
          data.scene = { ...data.scene, files: images.files };
        }
        if (live) { setItem(data); setState('ready'); }
      } catch {
        if (live) setState('unavailable');
      }
    })();
    return () => { live = false; };
  }, [token]);

  if (state === 'loading') return <Centered><div style={muted}>Loading&hellip;</div></Centered>;
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
          <h1 style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', margin: 0 }}>{item.title}</h1>
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
