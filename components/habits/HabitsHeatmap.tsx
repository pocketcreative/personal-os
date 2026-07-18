'use client';
import { buildHeatmapWeeks, dailyCompletionCounts } from '@/lib/habitHeatmap';
import type { HabitLog } from '@/lib/useHabits';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cellColor(count: number): string {
  if (count === 0) return 'rgba(17,17,17,.05)';
  if (count === 1) return 'rgba(154,122,46,.28)';
  if (count === 2) return 'rgba(154,122,46,.52)';
  if (count === 3) return 'rgba(154,122,46,.76)';
  return '#9a7a2e';
}

/**
 * GitHub-style contribution heatmap: one column per week (Sun-Sat, matching
 * GitHub's own convention — deliberately not this app's Mon-start weekly
 * grid above it), shaded by how many habits were completed that day. Shows
 * raw count, not a percentage of "expected" — a historical day's expected
 * count would depend on which habits existed and were scheduled as of that
 * date, which isn't tracked; raw count sidesteps that ambiguity entirely
 * and matches what GitHub itself shows (commit count, not "% of typical").
 */
export default function HabitsHeatmap({ logs, startDate, endDate }: {
  logs: HabitLog[];
  startDate: string;
  endDate: string;
}) {
  const weeks = buildHeatmapWeeks(startDate, endDate);
  const counts = dailyCompletionCounts(logs);

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
                {week.map((date, di) => (
                  <div
                    key={di}
                    title={date ? `${date}: ${counts.get(date) ?? 0} habit${(counts.get(date) ?? 0) === 1 ? '' : 's'} completed` : undefined}
                    style={{
                      width: 11, height: 11, borderRadius: 2,
                      background: date ? cellColor(counts.get(date) ?? 0) : 'transparent',
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
