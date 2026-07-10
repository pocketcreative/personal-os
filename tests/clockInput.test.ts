import { describe, it, expect } from 'vitest';
import { formatClock, parseClockInput } from '@/lib/clockInput';

describe('formatClock', () => {
  it('formats minutes as HH:MM', () => {
    expect(formatClock(90)).toBe('01:30');
    expect(formatClock(5)).toBe('00:05');
    expect(formatClock(0)).toBe('00:00');
  });
  it('clamps negative/undefined to 00:00', () => {
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(undefined as unknown as number)).toBe('00:00');
  });
});

describe('parseClockInput', () => {
  it('fills digits right-to-left like a stopwatch entry', () => {
    // typing "130" into an HH:MM field should read as 01:30 (90 minutes)
    expect(parseClockInput('130')).toBe(90);
  });
  it('strips non-digit characters before parsing', () => {
    expect(parseClockInput('01:30')).toBe(90);
    expect(parseClockInput('abc12de34')).toBe(parseClockInput('1234'));
  });
  it('clamps minutes to 0-59 and takes only the last 4 digits', () => {
    expect(parseClockInput('9999')).toBe(99 * 60 + 59); // HH=99 (not clamped, hours can exceed 59), MM clamped to 59
    expect(parseClockInput('123456')).toBe(parseClockInput('3456')); // only last 4 digits kept
  });
  it('handles empty input as 0', () => {
    expect(parseClockInput('')).toBe(0);
  });
});
