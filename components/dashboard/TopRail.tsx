'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/', label: 'HOME' },
  { href: '/tasks', label: 'TASKS' },
  { href: '/review', label: 'REVIEW' },
];

export default function TopRail() {
  const pathname = usePathname();
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () =>
      setTime(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date()));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <nav className="flex items-center justify-between border-b px-6 py-3" style={{ borderColor: 'var(--ink-2)' }}>
      <span className="mono text-sm" style={{ color: 'var(--accent)' }}>● BRENDAN OS</span>
      <div className="flex gap-6">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="mono text-xs tracking-[0.2em]"
            style={{ color: pathname === t.href ? 'var(--ink-4)' : 'var(--ink-3)' }}>
            {t.label}
          </Link>
        ))}
      </div>
      <span className="mono text-sm">{time}</span>
    </nav>
  );
}
