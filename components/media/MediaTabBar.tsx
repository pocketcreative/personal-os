'use client';
import Link from 'next/link';
import ShareControl from '@/components/shares/ShareControl';

// Matches /tasks' header styling exactly (Archivo 800 title, #fbfaf7 panel,
// same pill-tab treatment as ContentDetailModal's Details/Comments switcher)
// -- decision 7: don't invent a new visual style for this.
//
// Calendar is not its own tab (corrected 2026-09-30, per Brendan: "calendar
// should be below the dashboard not in the same tab") -- it's a persistent
// section every board tab renders below its own board, see ContentBoard.tsx.
export type MediaTab = 'lf' | 'lts' | 'sf' | 'ad' | 'vsl' | 'ideas';

const TABS: { id: MediaTab; label: string; href: string }[] = [
  { id: 'lf', label: 'LF', href: '/media/lf' },
  { id: 'lts', label: 'LTS', href: '/media/lts' },
  { id: 'sf', label: 'SF', href: '/media/sf' },
  { id: 'ad', label: 'Ads', href: '/media/ad' },
  { id: 'vsl', label: 'VSL', href: '/media/vsl' },
  { id: 'ideas', label: 'Ideas', href: '/media/ideas' },
];

export default function MediaTabBar({ active }: { active: MediaTab }) {
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
              no single row "the whole CMS" points at, so `id` is omitted. */}
          <ShareControl type="cms" align="right" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href}
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
