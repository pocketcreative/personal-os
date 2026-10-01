'use client';
import { useShareGate } from '@/lib/useShareGate';
import { ShareContext } from '@/lib/shareContext';
import ContentBoard from '@/components/media/ContentBoard';
import IdeasTab from '@/components/media/IdeasTab';
import CalendarView from '@/components/media/CalendarView';
import MediaTabBar, { type MediaTab } from '@/components/media/MediaTabBar';
import type { ContentItemType } from '@/lib/types';

// One tab of the public /share/[token] CMS view -- the exact same
// ContentBoard (for lf/lts/sf/ad/vsl) or Ideas composition (for 'ideas')
// the logged-in /media/<tab> pages render, just wrapped in ShareContext so
// every component underneath fetches/patches through the share-scoped API
// (see lib/shareContext.tsx) instead of the internal one. Each
// app/share/[token]/<tab>/page.tsx mirrors its app/media/<tab>/page.tsx
// one-to-one and renders this with that tab baked in.
//
// Password gate + validity check live here (useShareGate) rather than in
// ContentBoard/IdeasTab themselves, so a share that isn't active, isn't
// password-verified yet, or isn't actually a 'cms' share never mounts the
// board at all.
export default function SharedMediaPage({ token, type }: { token: string; type: MediaTab }) {
  const gate = useShareGate(token);

  if (gate.state === 'loading') return <Centered><div style={muted}>Loading&hellip;</div></Centered>;

  if (gate.state === 'password') {
    return (
      <Centered>
        <div style={{ width: 'min(320px, 90vw)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ font: "700 16px 'Inter Tight', sans-serif", color: '#111' }}>This link is password protected</div>
          <input
            type="password"
            value={gate.password}
            onChange={(e) => gate.setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') gate.submitPassword(); }}
            placeholder="Password"
            autoFocus
            className="tap-44"
            style={{ font: "500 14px 'Inter Tight', sans-serif", padding: '10px 12px', border: '1px solid rgba(17,17,17,.18)', borderRadius: 8 }}
          />
          {gate.pwError && <div style={{ font: "500 12.5px 'Inter Tight', sans-serif", color: '#b3261e' }}>{gate.pwError}</div>}
          <button
            onClick={gate.submitPassword}
            disabled={gate.pwBusy || !gate.password}
            className="tap-44"
            style={{
              font: "700 13px 'Inter Tight', sans-serif", color: '#fff', background: '#024ADD', border: 'none',
              borderRadius: 8, padding: '10px 16px', cursor: gate.pwBusy ? 'default' : 'pointer', opacity: gate.pwBusy || !gate.password ? 0.6 : 1,
            }}
          >
            {gate.pwBusy ? 'Checking…' : 'View'}
          </button>
        </div>
      </Centered>
    );
  }

  if (gate.state === 'unavailable' || gate.resourceType !== 'cms') {
    return <Centered><div style={{ font: "600 15px 'Inter Tight', sans-serif", color: '#111' }}>This link isn&apos;t available.</div></Centered>;
  }

  return (
    <ShareContext.Provider value={{ token }}>
      {type === 'ideas' ? (
        <div style={{ width: '96%', maxWidth: 2200, margin: '0 auto', padding: 'clamp(16px, 6vw, 56px) 0' }}>
          <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, boxShadow: '0 2px 18px rgba(0,0,0,.05)' }}>
            <MediaTabBar active="ideas" />
            <IdeasTab />
            <div style={{ borderTop: '1px solid rgba(17,17,17,.08)', paddingTop: 20 }}>
              <div style={{ font: "700 13px 'Archivo', sans-serif", color: '#111', padding: '0 clamp(14px, 3vw, 44px)', marginBottom: 4 }}>Calendar</div>
              <CalendarView />
            </div>
            <div style={{ height: 24 }} />
          </div>
        </div>
      ) : (
        <ContentBoard type={type as ContentItemType} />
      )}
    </ShareContext.Provider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>{children}</div>;
}

const muted: React.CSSProperties = { font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)' };
