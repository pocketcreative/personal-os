'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/', label: 'Home' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/review', label: 'Review' },
];

export default function TopRail() {
  const pathname = usePathname();
  const [time, setTime] = useState('');
  const [dateStr, setDateStr] = useState('');
  useEffect(() => {
    const tick = () => {
      setDateStr(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Singapore', weekday: 'short', month: 'short', day: 'numeric',
      }).format(new Date()));
      setTime(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(new Date()));
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <nav
      className="flex items-center justify-between px-6 py-3"
      style={{ background: 'var(--ink-1)', borderBottom: '1px solid var(--ink-2)' }}
    >
      <span style={{ font: "800 15px 'Archivo', sans-serif", color: 'var(--ink-4)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
        Brendan OS
      </span>
      <div className="flex gap-7">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 13,
                fontWeight: active ? 700 : 600,
                color: active ? 'var(--ink-4)' : 'var(--ink-3)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                paddingBottom: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
        <span className="hidden sm:inline">{dateStr} · </span>{time}
      </span>
    </nav>
  );
}
