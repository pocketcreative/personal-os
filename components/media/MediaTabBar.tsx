'use client';
import Link from 'next/link';
import ShareControl from '@/components/shares/ShareControl';
import { useShareContext } from '@/lib/shareContext';

// Matches /tasks' header styling exactly (Archivo 800 title, #fbfaf7 panel,
// same pill-tab treatment as ContentDetailModal's Details/Comments switcher)
// -- decision 7: don't invent a new visual style for this.
//
// Calendar is not its own tab (corrected 2026-09-30, per Brendan: "calendar
// should be below the dashboard not in the same tab") -- it's a persistent
// section every board tab renders below its own board, see ContentBoard.tsx.
export type MediaTab = 'lf' | 'lts' | 'sf' | 'ad' | 'vsl' | 'ideas';

const TABS: { id: MediaTab; label: string }[] = [
  { id: 'lf', label: 'LF' },
  { id: 'lts', label: 'LTS' },
  { id: 'sf', label: 'SF' },
  { id: 'ad', label: 'Ads' },
  { id: 'vsl', label: 'VSL' },
  { id: 'ideas', label: 'Ideas' },
];

// Same bar the internal /media/* pages use, now also reused as-is on the
// public /share/[token]/* CMS view (see lib/shareContext.tsx) -- a share
// viewer gets the same LF/LTS/SF/Ads/VSL/Ideas tabs, pointed at
// /share/[token]/<tab> instead of /media/<tab>, with no Share button (a
// public link holder must never be able to mint another share link).
export default function MediaTabBar({ active }: { active: MediaTab }) {
  const share = useShareContext();
  const basePath = share ? `/share/${share.token}` : '/media';
  return (
    <div style={{ padding: 'clamp(16px, 4vw, 40px) clamp(14px, 3vw, 44px) 8px' }}>
      <div className="board-header" style={{ marginBottom: 20 }}>
        <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Content</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          {/* Shares the whole CMS (every type, not just this tab) -- there's
              no single row "the whole CMS" points at, so `id` is omitted.
              Not shown on the shared view itself. */}
          {!share && <ShareControl type="cms" align="right" />}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`${basePath}/${t.id}`}
            style={{
              font: "700 12px 'Inter Tight', sans-serif", letterSpacing: '.02em',
              color: active === t.id ? '#fff' : '#111',
              background: active === t.id ? '#111' : 'rgba(17,17,17,.06)',
              border: 'none', borderRadius: 20, padding: '8px 16px',
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
