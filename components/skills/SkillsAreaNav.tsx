'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Shared toggle for the Skills area (Skills / SOPs) so SOPs lives clearly
// inside the same navigational area as Skills rather than as a disconnected
// new top-level page (per the build brief). Used by SkillsBoard and
// SopsBoard. Skills and the old Skills Library are now one page (`/skills`,
// filterable by source) -- the separate Library tab/route is gone;
// `/skills/library` redirects to `/skills`.
const TABS = [
  { href: '/skills', label: 'Skills' },
  { href: '/skills/sops', label: 'SOPs' },
];

function isActive(href: string, pathname: string): boolean {
  if (href === '/skills') {
    return pathname === '/skills' || (pathname.startsWith('/skills/') && !pathname.startsWith('/skills/sops'));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SkillsAreaNav() {
  const pathname = usePathname();
  return (
    <div style={{ display: 'flex', gap: 20, marginBottom: 18, borderBottom: '1px solid rgba(17,17,17,.08)' }}>
      {TABS.map((t) => {
        const active = isActive(t.href, pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              font: `700 12.5px 'Inter Tight', sans-serif`,
              color: active ? '#024ADD' : 'rgba(17,17,17,.45)',
              textDecoration: 'none',
              borderBottom: active ? '2px solid #024ADD' : '2px solid transparent',
              paddingBottom: 8,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
