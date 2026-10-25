'use client';
import { useState } from 'react';
import TodayView from '@/components/scorecard/TodayView';
import HabitsView from '@/components/scorecard/HabitsView';
import ProgressView from '@/components/scorecard/ProgressView';

const TABS = ['Today', 'Progress', 'Habits'] as const;
type Tab = (typeof TABS)[number];

export default function ScorecardBoard({ today }: { today: string }) {
  const [tab, setTab] = useState<Tab>('Today');
  const [date, setDate] = useState(today);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 560, padding: '16px' }}>
      <div className="mb-4 flex gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            style={{
              flex: 1, minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14,
              border: '1px solid var(--ink-2)',
              background: tab === t ? 'var(--ink-4)' : 'var(--ink-1)',
              color: tab === t ? 'var(--ink-0)' : 'var(--ink-3)',
            }}
          >{t}</button>
        ))}
      </div>
      {tab === 'Today' && <TodayView today={today} date={date} onDateChange={setDate} />}
      {tab === 'Progress' && <ProgressView onOpenDay={(d) => { setDate(d); setTab('Today'); }} />}
      {tab === 'Habits' && <HabitsView />}
    </div>
  );
}
