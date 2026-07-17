import { describe, it, expect } from 'vitest';
import { calcCompletionPercent, type HabitForStats, type HabitLogForStats } from '@/lib/habitStats';

const daily = (id: string): HabitForStats => ({ id, schedule_days: [0, 1, 2, 3, 4, 5, 6], active: true });
const weekdaysOnly = (id: string): HabitForStats => ({ id, schedule_days: [1, 2, 3, 4, 5], active: true });
const log = (habit_id: string, log_date: string, completed: boolean): HabitLogForStats =>
  ({ habit_id, log_date, completed });

describe('calcCompletionPercent', () => {
  it('returns null when there are no active habits', () => {
    expect(calcCompletionPercent([], [], '2026-07-13', '2026-07-15')).toBeNull();
  });

  it('returns null when the only habit is archived (inactive)', () => {
    const habits = [{ id: 'h1', schedule_days: [0, 1, 2, 3, 4, 5, 6], active: false }];
    expect(calcCompletionPercent(habits, [], '2026-07-13', '2026-07-15')).toBeNull();
  });

  it('computes a simple percentage over a 3-day range for one daily habit', () => {
    // 2026-07-13 (Mon) .. 2026-07-15 (Wed): 3 expected, 2 completed -> 67%
    const logs = [
      log('h1', '2026-07-13', true),
      log('h1', '2026-07-14', false),
      log('h1', '2026-07-15', true),
    ];
    expect(calcCompletionPercent([daily('h1')], logs, '2026-07-13', '2026-07-15')).toBe(67);
  });

  it('combines multiple habits into one aggregate percentage', () => {
    // 2 daily habits x 2 days = 4 expected; 3 completed -> 75%
    const logs = [
      log('h1', '2026-07-13', true),
      log('h1', '2026-07-14', true),
      log('h2', '2026-07-13', true),
      log('h2', '2026-07-14', false),
    ];
    expect(calcCompletionPercent([daily('h1'), daily('h2')], logs, '2026-07-13', '2026-07-14')).toBe(75);
  });

  it('a single day, completed, is 100%', () => {
    expect(calcCompletionPercent([daily('h1')], [log('h1', '2026-07-15', true)], '2026-07-15', '2026-07-15')).toBe(100);
  });

  it('a single day, not logged at all, is 0% (not null — the habit was expected)', () => {
    expect(calcCompletionPercent([daily('h1')], [], '2026-07-15', '2026-07-15')).toBe(0);
  });

  it('only counts days within schedule_days — weekday-only habit skips the weekend', () => {
    // 2026-07-17 (Fri) .. 2026-07-19 (Sun): only Friday is scheduled -> 1 expected
    const logs = [log('h1', '2026-07-17', true)];
    expect(calcCompletionPercent([weekdaysOnly('h1')], logs, '2026-07-17', '2026-07-19')).toBe(100);
  });

  it('rounds to the nearest whole percent', () => {
    // 1 of 3 = 33.33...
    const habits = [daily('h1')];
    const logs = [log('h1', '2026-07-13', true)];
    expect(calcCompletionPercent(habits, logs, '2026-07-13', '2026-07-15')).toBe(33);
  });
});
