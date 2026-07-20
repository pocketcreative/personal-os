import { describe, it, expect } from 'vitest';
import { calcCompletionPercent, habitTrackingStart, calcHabitPeriodStats, HABITS_LAUNCH_DATE, type HabitForStats, type HabitLogForStats } from '@/lib/habitStats';

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

describe('habitTrackingStart', () => {
  it('returns the launch date when the habit was created before launch', () => {
    expect(habitTrackingStart('2026-07-15T00:00:00Z', '2026-07-18')).toBe('2026-07-18');
  });
  it('returns the habit\'s own creation date when created after launch', () => {
    expect(habitTrackingStart('2026-07-21T00:00:00Z', '2026-07-18')).toBe('2026-07-21');
  });
  it('returns the launch date when the habit was created exactly on launch day', () => {
    expect(habitTrackingStart('2026-07-18T09:30:00Z', '2026-07-18')).toBe('2026-07-18');
  });
  it('defaults to HABITS_LAUNCH_DATE when no launchDate argument is given', () => {
    expect(habitTrackingStart('2026-01-01T00:00:00Z')).toBe(HABITS_LAUNCH_DATE);
  });
});

describe('calcHabitPeriodStats', () => {
  const periods = { weekStart: '2026-07-20', monthStart: '2026-07-01', yearStart: '2026-01-01', today: '2026-07-25' };

  it('a habit that existed since launch: week clamps to weekStart, but month/year/allTime clamp to launch (2026-07-18) since that is LATER than their natural period start', () => {
    const habit = { id: 'h1', schedule_days: [0, 1, 2, 3, 4, 5, 6], active: true, created_at: '2026-07-18T00:00:00Z' };
    const logs = [
      { habit_id: 'h1', log_date: '2026-07-18', completed: true },
      { habit_id: 'h1', log_date: '2026-07-19', completed: true },
      { habit_id: 'h1', log_date: '2026-07-20', completed: true },
      { habit_id: 'h1', log_date: '2026-07-21', completed: false },
      { habit_id: 'h1', log_date: '2026-07-22', completed: true },
      { habit_id: 'h1', log_date: '2026-07-23', completed: true },
      { habit_id: 'h1', log_date: '2026-07-24', completed: true },
      { habit_id: 'h1', log_date: '2026-07-25', completed: true },
    ];
    const stats = calcHabitPeriodStats(habit, logs, periods);
    // week: periods.weekStart (2026-07-20) is already later than the habit's
    // trackingStart (2026-07-18), so it wins unclamped -- range 07-20..25 (6
    // days), 5 of 6 completed (07-21 is false) -> 83%.
    expect(stats.week).toBe(83);
    // month/year: their natural starts (07-01, 01-01) are EARLIER than
    // trackingStart (07-18), so trackingStart wins -- range 07-18..25 (8
    // days), 7 of 8 completed -> 88%. This is the exact latent-unfairness
    // case Task 3 also fixes for the existing aggregate stat chips.
    expect(stats.month).toBe(88);
    expect(stats.year).toBe(88);
    expect(stats.allTime).toBe(88);
  });

  it('a habit created mid-week after launch is clamped on every period, matching the approved mockup example', () => {
    const habit = { id: 'h2', schedule_days: [0, 1, 2, 3, 4, 5, 6], active: true, created_at: '2026-07-23T12:00:00Z' };
    const logs = [
      { habit_id: 'h2', log_date: '2026-07-23', completed: true },
      { habit_id: 'h2', log_date: '2026-07-24', completed: true },
      { habit_id: 'h2', log_date: '2026-07-25', completed: true },
    ];
    const stats = calcHabitPeriodStats(habit, logs, periods);
    // Every period clamps to 2026-07-23 (the habit's own creation date, later
    // than weekStart/monthStart/yearStart/launch) -- 3 of 3 days completed,
    // so every column reads 100%, not a deflated score for days it didn't exist.
    expect(stats.week).toBe(100);
    expect(stats.month).toBe(100);
    expect(stats.year).toBe(100);
    expect(stats.allTime).toBe(100);
  });

  it('a weekday-only habit is unaffected by clamping when its schedule already excludes the clamped days', () => {
    const habit = { id: 'h3', schedule_days: [1, 2, 3, 4, 5], active: true, created_at: '2026-07-18T00:00:00Z' };
    const logs = [
      { habit_id: 'h3', log_date: '2026-07-20', completed: true }, // Monday
      { habit_id: 'h3', log_date: '2026-07-21', completed: true }, // Tuesday
    ];
    // periods.weekStart (2026-07-20) is a Monday; only weekdays count
    const stats = calcHabitPeriodStats(habit, logs, { ...periods, today: '2026-07-21' });
    expect(stats.week).toBe(100);
  });
});
