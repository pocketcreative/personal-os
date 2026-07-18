'use client';
import { buildHeatmapWeeks, dailyCompletionPercents } from '@/lib/habitHeatmap';
import type { Habit, HabitLog } from '@/lib/useHabits';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cellColor(percent: number | null): string {
  if (percent === null || percent === 0) return 'rgba(17,17,17,.05)';
  if (percent <= 25) return 'rgba(154,122,46,.28)';
  if (percent <= 50) return 'rgba(154,122,46,.52)';
  if (percent <= 75) return 'rgba(154,122,46,.76)';
  // 76-99 gets its own step, distinct from the solid 100% below -- without
  // this, a day with one scheduled habit left undone (e.g. 4-of-5, 80%)
  // renders identically to a fully-completed day, which was the exact bug
  // this heatmap change was meant to fix.
  if (percent < 100) return 'rgba(154,122,46,.88)';
  return '#9a7a2e';
}

/**
 * GitHub-style contribution heatmap: one column per week (Sun-Sat, matching
 * GitHub's own convention -- deliberately not this app's Mon-start weekly
 * grid above it), shaded by what PERCENTAGE of that day's scheduled habits
 * were completed. Percentage rather than a raw count so the scale keeps
 * working no matter how many habits exist -- a fixed count scale maxes out
 * once the habit roster grows past its hardcoded bucket count.
 */
export default function HabitsHeatmap({ habits, logs, startDate, endDate }: {
  habits: Habit[];
  logs: HabitLog[];
  startDate: string;
  endDate: string;
}) {
  const weeks = buildHeatmapWeeks(startDate, endDate);
  const percents = dailyCompletionPercents(habits, logs, startDate, endDate);

  // Pure pass (no mutation during the JSX .map() below): each week's month
  // label only shows when it differs from the PRECEDING week's, so labels
  // don't repeat every column. Computed via reduce's accumulator rather
  // than a captured outer variable, since mutating a render-scoped
  // variable while producing JSX trips React Compiler's immutability lint.
  const weekMeta = weeks.reduce<{ month: number; showLabel: boolean }[]>((acc, week) => {
    const firstRealDay = week.find((d): d is string => d !== null);
    const prevMonth = acc.at(-1)?.month ?? -1;
    const month = firstRealDay ? Number(firstRealDay.slice(5, 7)) - 1 : prevMonth;
    acc.push({ month, showLabel: month !== prevMonth });
    return acc;
  }, []);

  return (
    <div>
      <div style={{
        font: "700 12px 'Archivo', sans-serif", color: '#111',
        letterSpacing: '.02em', textTransform: 'uppercase', marginBottom: 16,
      }}>Activity</div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'inline-flex', gap: 3, marginTop: 18 }}>
          {weeks.map((week, wi) => {
            const { month, showLabel } = weekMeta[wi];
            return (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative' }}>
                {showLabel && (
                  <div style={{
                    position: 'absolute', top: -18, left: 0,
                    font: "600 10px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', whiteSpace: 'nowrap',
                  }}>{MONTH_ABBR[month]}</div>
                )}
                {week.map((date, di) => {
                  const percent = date ? percents.get(date) ?? null : null;
                  return (
                    <div
                      key={di}
                      title={date ? (percent === null ? `${date}: nothing scheduled` : `${date}: ${percent}% complete`) : undefined}
                      style={{
                        width: 11, height: 11, borderRadius: 2,
                        background: date ? cellColor(percent) : 'transparent',
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
