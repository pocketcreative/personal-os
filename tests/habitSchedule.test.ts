import { describe, it, expect } from 'vitest';
import { describeSchedule } from '@/lib/habitSchedule';

describe('describeSchedule', () => {
  it('describes all 7 days as Daily', () => {
    expect(describeSchedule([0, 1, 2, 3, 4, 5, 6])).toBe('Daily');
  });

  it('describes exactly Mon-Fri as Weekdays', () => {
    expect(describeSchedule([1, 2, 3, 4, 5])).toBe('Weekdays');
  });

  it('describes exactly Sat-Sun as Weekends', () => {
    expect(describeSchedule([0, 6])).toBe('Weekends');
  });

  it('describes an arbitrary subset as abbreviated day names in Mon-first week order', () => {
    expect(describeSchedule([5, 1, 3])).toBe('Mon, Wed, Fri');
  });

  it('describes a single day', () => {
    expect(describeSchedule([2])).toBe('Tue');
  });

  it('is order-independent in its input (always outputs Mon-first week order)', () => {
    expect(describeSchedule([6, 0])).toBe('Weekends');
    expect(describeSchedule([0, 1, 2, 3, 4, 5, 6].reverse())).toBe('Daily');
  });

  it('5 weekday-numbered days that are not exactly Mon-Fri falls through to the day list', () => {
    // Mon,Tue,Wed,Thu,Sat (not Fri) — same size (5) as Weekdays but not the same set
    expect(describeSchedule([1, 2, 3, 4, 6])).toBe('Mon, Tue, Wed, Thu, Sat');
  });
});
