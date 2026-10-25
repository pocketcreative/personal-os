import { describe, it, expect } from 'vitest';
import { localDateKey } from '@/lib/dates';
import {
  dayScore, snapshotFromHabits, syncSnapshot, buildSeries, periodAverages,
  currentStreak, trailingAverage, perHabitHitRate, type DayItem, type Habit,
} from '@/lib/scorecard';

const items = (...done: boolean[]) => done.map((d) => ({ done: d }));
const H = (id: string, sort_order: number, name = id): Habit => ({ id, name, sort_order });

describe('dayScore', () => {
  it('scores each day on its own list size', () => {
    expect(dayScore(items(true, true, true, false))).toBe(75);
    expect(dayScore(items(true, true, true, true, true, false, false))).toBeCloseTo(71.43, 1);
  });
  it('returns null for an empty day', () => expect(dayScore([])).toBeNull());
});

describe('syncSnapshot', () => {
  const existing: DayItem[] = [
    { habit_id: 'a', name: 'old a', done: true, sort_order: 1 },
    { habit_id: 'b', name: 'b', done: true, sort_order: 2 },
    { habit_id: null, name: 'one-off', done: false, sort_order: 9 },
  ];
  it('adds new unticked, removes archived, renames, keeps done and one-offs', () => {
    const out = syncSnapshot(existing, [H('a', 1, 'new a'), H('c', 3)]);
    expect(out.map((i) => [i.name, i.done])).toEqual([
      ['new a', true], ['c', false], ['one-off', false],
    ]);
  });
});

describe('snapshotFromHabits', () => {
  it('is unticked and sorted', () => {
    const out = snapshotFromHabits([H('b', 2), H('a', 1)]);
    expect(out.map((i) => i.habit_id)).toEqual(['a', 'b']);
    expect(out.every((i) => !i.done)).toBe(true);
  });
});

describe('buildSeries', () => {
  it('scores a skipped day between logged days as 0', () => {
    const m = new Map([['2026-10-01', items(true, true)], ['2026-10-03', items(true, false)]]);
    const s = buildSeries('2026-10-01', '2026-10-04', m);
    expect(s.map((p) => p.pct)).toEqual([100, 0, 50]); // 10-04 is today, no snapshot yet: not counted
  });
  it('counts today once it has a snapshot', () => {
    const m = new Map([['2026-10-01', items(true)], ['2026-10-02', items(false, false)]]);
    expect(buildSeries('2026-10-01', '2026-10-02', m).map((p) => p.pct)).toEqual([100, 0]);
  });
  it('is empty with no first date', () => expect(buildSeries(null, '2026-10-02', new Map())).toEqual([]));
});

describe('periodAverages', () => {
  it('monthly = mean of daily %, not ticks over items', () => {
    const series = [
      { date: '2026-10-01', pct: 100 },     // 1 of 1
      { date: '2026-10-02', pct: 25 },      // 1 of 4
    ];
    const [oct] = periodAverages(series, 'month');
    expect(oct.avg).toBe(62.5);             // ticks/items would be 40
  });
  it('weeks key by Monday, years by year', () => {
    const series = [
      { date: '2026-10-25', pct: 100 }, // Sunday
      { date: '2026-10-26', pct: 50 },  // Monday, next week
    ];
    expect(periodAverages(series, 'week').map((w) => w.key)).toEqual(['2026-10-19', '2026-10-26']);
    expect(periodAverages(series, 'year')[0].key).toBe('2026');
  });
});

describe('trailingAverage and streak', () => {
  const s = [
    { date: '2026-10-21', pct: 90 }, { date: '2026-10-22', pct: 85 },
    { date: '2026-10-23', pct: 50 }, { date: '2026-10-24', pct: 80 },
    { date: '2026-10-25', pct: 100 },
  ];
  it('trailing 2 days', () => expect(trailingAverage(s, '2026-10-25', 2)).toBe(90));
  it('streak runs through today at >=80', () => expect(currentStreak(s, '2026-10-25', 80)).toBe(2));
  it('streak survives an unfinished today', () => {
    const t = [...s.slice(0, 4), { date: '2026-10-25', pct: 20 }];
    expect(currentStreak(t, '2026-10-25', 80)).toBe(1);
  });
});

describe('perHabitHitRate', () => {
  it('ranks worst first and ignores one-offs', () => {
    const rows = [
      { date: 'd1', habit_id: 'a', name: 'A', done: true },
      { date: 'd2', habit_id: 'a', name: 'A', done: false },
      { date: 'd1', habit_id: 'b', name: 'B', done: true },
      { date: 'd1', habit_id: null, name: 'x', done: false },
    ];
    const r = perHabitHitRate(rows);
    expect(r.map((x) => [x.name, x.pct])).toEqual([['A', 50], ['B', 100]]);
  });
});

describe('SGT day boundary', () => {
  it('11:59pm SGT is today, 12:01am is tomorrow', () => {
    expect(localDateKey(new Date('2026-10-25T15:59:00Z'), 'Asia/Singapore')).toBe('2026-10-25');
    expect(localDateKey(new Date('2026-10-25T16:01:00Z'), 'Asia/Singapore')).toBe('2026-10-26');
  });
});
