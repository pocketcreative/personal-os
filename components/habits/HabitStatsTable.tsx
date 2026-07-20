'use client';
import { calcHabitPeriodStats, habitTrackingStart } from '@/lib/habitStats';
import { daysBetween } from '@/lib/dates';
import type { Habit, HabitLog } from '@/lib/useHabits';

function PercentCell({ value }: { value: number | null }) {
  return (
    <td style={{ textAlign: 'center', padding: '10px', font: "800 14px 'Archivo', sans-serif", color: '#9a7a2e' }}>
      {value === null ? '—' : `${value}%`}
    </td>
  );
}

const COLUMN_HEADER_STYLE = {
  textAlign: 'center' as const, padding: '0 10px 10px', font: "700 11px 'Archivo', sans-serif",
  color: 'rgba(17,17,17,.4)', textTransform: 'uppercase' as const, letterSpacing: '.03em', width: 70,
};

/**
 * Week/Month/Year/All-time completion percentage per habit. Every period is
 * clamped to habitTrackingStart (see lib/habitStats.ts), so a habit created
 * after launch -- or mid-week -- never shows a deflated score for days it
 * didn't exist. The "added N days ago" note only appears when that clamping
 * actually changed something for the CURRENT week, so it's clear why a new
 * habit's numbers might all read identically instead of looking wrong.
 */
export default function HabitStatsTable({ habits, logs, weekStart, monthStart, yearStart, today }: {
  habits: Habit[];
  logs: HabitLog[];
  weekStart: string;
  monthStart: string;
  yearStart: string;
  today: string;
}) {
  if (habits.length === 0) return null;

  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid rgba(17,17,17,.08)' }}>
      <div style={{
        font: "700 12px 'Archivo', sans-serif", color: '#111',
        letterSpacing: '.02em', textTransform: 'uppercase', marginBottom: 14,
      }}>Habit Performance</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left', padding: '0 12px 10px 0', font: "700 11px 'Archivo', sans-serif",
                color: 'rgba(17,17,17,.4)', textTransform: 'uppercase', letterSpacing: '.03em',
              }}>Habit</th>
              <th style={COLUMN_HEADER_STYLE}>Week</th>
              <th style={COLUMN_HEADER_STYLE}>Month</th>
              <th style={COLUMN_HEADER_STYLE}>Year</th>
              <th style={{ ...COLUMN_HEADER_STYLE, padding: '0 0 10px 10px', width: 80 }}>All-time</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((habit) => {
              const stats = calcHabitPeriodStats(habit, logs, { weekStart, monthStart, yearStart, today });
              const trackingStart = habitTrackingStart(habit.created_at);
              // >= (not >) so a habit created exactly on the current week's
              // start (e.g. added on a Monday, when weekStart === today)
              // still gets the explanatory badge -- otherwise the week
              // period wasn't "clamped" in the strict sense, but the habit
              // is still brand new and its numbers are still misleadingly
              // uniform.
              const isNew = trackingStart >= weekStart;
              // Clamp to non-negative: a future created_at (bad data, clock
              // skew) would otherwise render "added -N days ago", which is
              // visibly wrong even though the percentages themselves already
              // degrade safely to "—" in that case.
              const age = Math.max(0, daysBetween(trackingStart, today));
              return (
                <tr key={habit.id} style={{ borderTop: '1px solid rgba(17,17,17,.06)' }}>
                  <td style={{ padding: '10px 12px 10px 0', font: "500 14px 'Inter Tight', sans-serif", color: '#111' }}>
                    {habit.name}
                    {isNew && (
                      <span style={{
                        font: "600 10px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
                        textTransform: 'uppercase', letterSpacing: '.03em', marginLeft: 8,
                      }}>
                        · added {age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}
                      </span>
                    )}
                  </td>
                  <PercentCell value={stats.week} />
                  <PercentCell value={stats.month} />
                  <PercentCell value={stats.year} />
                  <PercentCell value={stats.allTime} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
