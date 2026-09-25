import { describe, it, expect } from 'vitest';
import { doneAt, isDoneRecently } from '@/lib/types';

const now = new Date('2026-09-25T12:00:00Z');

describe('doneAt', () => {
  it('uses completed_at when it exists', () => {
    expect(doneAt({ completed_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-24T00:00:00Z' })).toBe('2026-09-20T00:00:00Z');
  });

  it('falls back to updated_at when completed_at is empty', () => {
    expect(doneAt({ completed_at: null, updated_at: '2026-09-24T00:00:00Z' })).toBe('2026-09-24T00:00:00Z');
  });
});

describe('isDoneRecently', () => {
  it('is true for a task finished a few days ago', () => {
    expect(isDoneRecently({ completed_at: '2026-09-22T09:00:00Z', updated_at: '2026-09-22T09:00:00Z' }, now)).toBe(true);
  });

  it('is false for a task finished more than 7 days ago', () => {
    expect(isDoneRecently({ completed_at: '2026-09-17T11:59:59Z', updated_at: '2026-09-17T11:59:59Z' }, now)).toBe(false);
  });

  it('counts exactly 7 days ago as recent, one second more as older', () => {
    expect(isDoneRecently({ completed_at: '2026-09-18T12:00:00Z', updated_at: '2026-09-18T12:00:00Z' }, now)).toBe(true);
    expect(isDoneRecently({ completed_at: '2026-09-18T11:59:59Z', updated_at: '2026-09-18T11:59:59Z' }, now)).toBe(false);
  });

  it('uses updated_at when completed_at is missing', () => {
    expect(isDoneRecently({ completed_at: null, updated_at: '2026-09-24T00:00:00Z' }, now)).toBe(true);
    expect(isDoneRecently({ completed_at: null, updated_at: '2026-08-01T00:00:00Z' }, now)).toBe(false);
  });

  it('is timezone safe: the same moment written with a Singapore offset gives the same answer', () => {
    // 2026-09-18T12:00:00Z is 2026-09-18T20:00:00+08:00, right on the 7 day line.
    expect(isDoneRecently({ completed_at: '2026-09-18T20:00:00+08:00', updated_at: '2026-09-18T20:00:00+08:00' }, now)).toBe(true);
    expect(isDoneRecently({ completed_at: '2026-09-18T19:59:59+08:00', updated_at: '2026-09-18T19:59:59+08:00' }, now)).toBe(false);
  });

  it('is not tied to the machine clock zone (same result under a different TZ)', () => {
    const before = process.env.TZ;
    try {
      for (const tz of ['Asia/Singapore', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = tz;
        expect(isDoneRecently({ completed_at: '2026-09-19T00:00:00Z', updated_at: '2026-09-19T00:00:00Z' }, now)).toBe(true);
      }
    } finally {
      if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
    }
  });
});
