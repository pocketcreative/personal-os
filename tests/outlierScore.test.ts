import { describe, it, expect } from 'vitest';
import {
  computeOutlierScores, groupBaseline, median, formatScore, isOutlier, roundScore, compareByScore,
  type ScoreInput,
} from '@/lib/outlierScore';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

// views listed oldest-first becomes newest-first by age (index 0 = oldest)
function mk(views: (number | null)[], format = 'long', startAge = 100): ScoreInput[] {
  return views.map((v, i) => ({ id: `${format}${i}`, publishedAt: daysAgo(startAge - i), views: v, format }));
}

describe('median', () => {
  it('odd count takes the middle', () => expect(median([50, 10, 30, 20, 40])).toBe(30));
  it('even count averages the two middle values', () => expect(median([10, 20, 30, 40, 50, 60])).toBe(35));
});

describe('computeOutlierScores', () => {
  it('odd pool: baseline 30', () => {
    const items = [...mk([10, 20, 30, 40, 50]), { id: 't', publishedAt: daysAgo(10), views: 60, format: 'long' }];
    const r = computeOutlierScores(items, NOW).t;
    expect(r.baseline).toBe(30);
    expect(r.score).toBeCloseTo(2);
    expect(r.status).toBe('scored');
  });

  it('even pool: baseline 35', () => {
    const items = [...mk([10, 20, 30, 40, 50, 60]), { id: 't', publishedAt: daysAgo(10), views: 70, format: 'long' }];
    expect(computeOutlierScores(items, NOW).t.baseline).toBe(35);
  });

  it('excludes the video itself from its own baseline', () => {
    const items = [...mk([10, 20, 30, 40, 50]), { id: 't', publishedAt: daysAgo(10), views: 1000, format: 'long' }];
    const r = computeOutlierScores(items, NOW).t;
    expect(r.baseline).toBe(30);
    expect(r.baselineCount).toBe(5);
  });

  it('uses only the 20 most recent eligible videos', () => {
    // 30 videos: the 10 oldest have 1,000,000 views and must be ignored by newest video
    const views = [...Array(10).fill(1_000_000), ...Array(20).fill(100)];
    const items = mk(views, 'long', 100);
    const newest = items[items.length - 1];
    const r = computeOutlierScores(items, NOW)[newest.id];
    // newest's pool excludes itself, takes the 20 newest others: 19 x 100 + 1 x 1,000,000
    expect(r.baselineCount).toBe(20);
    expect(r.baseline).toBe(100);
  });

  it('under 7 days: too_new, no score, and not used in other baselines', () => {
    const items = [...mk([10, 20, 30, 40, 50]), { id: 'new', publishedAt: daysAgo(3), views: 9999, format: 'long' }, { id: 't', publishedAt: daysAgo(10), views: 30, format: 'long' }];
    const res = computeOutlierScores(items, NOW);
    expect(res.new.status).toBe('too_new');
    expect(res.new.score).toBeNull();
    expect(res.t.baseline).toBe(30);
  });

  it('exactly 7 days old counts as eligible', () => {
    const items = [...mk([10, 20, 30, 40, 50]), { id: 'edge', publishedAt: daysAgo(7), views: 60, format: 'long' }];
    expect(computeOutlierScores(items, NOW).edge.status).toBe('scored');
  });

  it('fewer than 5 in the pool: not_enough', () => {
    const items = mk([10, 20, 30, 40, 50]); // each video has only 4 others
    const res = computeOutlierScores(items, NOW);
    for (const r of Object.values(res)) { expect(r.status).toBe('not_enough'); expect(r.score).toBeNull(); }
  });

  it('only video in its group: not_enough', () => {
    const r = computeOutlierScores([{ id: 'a', publishedAt: daysAgo(30), views: 100, format: 'long' }], NOW).a;
    expect(r.status).toBe('not_enough');
  });

  it('baseline 0: not_enough, no NaN or Infinity', () => {
    const items = mk([0, 0, 0, 0, 0, 0]);
    for (const r of Object.values(computeOutlierScores(items, NOW))) {
      expect(r.status).toBe('not_enough');
      expect(r.score).toBeNull();
    }
  });

  it('target with 0 views and baseline above 0 scores 0', () => {
    const items = [...mk([10, 20, 30, 40, 50]), { id: 'z', publishedAt: daysAgo(10), views: 0, format: 'long' }];
    const r = computeOutlierScores(items, NOW).z;
    expect(r.score).toBe(0);
    expect(r.status).toBe('scored');
  });

  it('null views: no_data and left out of pools', () => {
    const items = [...mk([10, 20, 30, 40, 50]), { id: 'n', publishedAt: daysAgo(10), views: null, format: 'long' }, { id: 't', publishedAt: daysAgo(9), views: 30, format: 'long' }];
    const res = computeOutlierScores(items, NOW);
    expect(res.n.status).toBe('no_data');
    expect(res.t.baselineCount).toBe(5);
    expect(res.t.baseline).toBe(30);
  });

  it('ties get equal scores', () => {
    const items = [...mk([10, 20, 30, 40, 50]), { id: 'a', publishedAt: daysAgo(10), views: 60, format: 'long' }, { id: 'b', publishedAt: daysAgo(9), views: 60, format: 'long' }];
    const res = computeOutlierScores(items, NOW);
    expect(res.a.score).toBeCloseTo(res.b.score!);
  });

  it('all values equal: every score is 1.0', () => {
    const items = mk([50, 50, 50, 50, 50, 50]);
    for (const r of Object.values(computeOutlierScores(items, NOW))) expect(r.score).toBe(1);
  });

  it('formats are scored separately (long vs short, REELS vs FEED)', () => {
    const long = mk([10, 20, 30, 40, 50, 60], 'long');
    const short = [{ id: 's', publishedAt: daysAgo(20), views: 1_000_000, format: 'short' }];
    const res = computeOutlierScores([...long, ...short], NOW);
    expect(res.s.status).toBe('not_enough');
    expect(res.long0.baseline).toBe(40);
    const reels = mk([100, 200, 300, 400, 500, 600], 'REELS');
    const feed = mk([5, 5, 5], 'FEED');
    const ig = computeOutlierScores([...reels, ...feed], NOW);
    expect(ig.FEED0.status).toBe('not_enough');
    expect(ig.REELS0.baseline).toBe(400);
  });

  it('real data fixture, 12 public long-form videos on 5 Oct 2026', () => {
    const views: Record<string, number> = {
      zOlpkxOVp64: 20, a1: 35, a2: 63, a3: 64, a4: 165, a5: 169, xIqbrJPxdaM: 180, a6: 195, a7: 213, a8: 323, aERR_npL7Hs: 376, TDwSuS3ntO8: 926,
    };
    const ids = Object.keys(views);
    const items: ScoreInput[] = ids.map((id, i) => ({ id, publishedAt: daysAgo(40 + i * 10), views: views[id], format: 'long' }));
    const res = computeOutlierScores(items, NOW);
    expect(roundScore(res.TDwSuS3ntO8.score!)).toBe(5.5);
    expect(res.TDwSuS3ntO8.score!).toBeCloseTo(5.48, 2);
    expect(res.aERR_npL7Hs.score!).toBeCloseTo(2.22, 2);
    expect(res.xIqbrJPxdaM.score!).toBeCloseTo(1.07, 2);
    expect(res.zOlpkxOVp64.score!).toBeCloseTo(0.11, 2);
    expect(formatScore(res.zOlpkxOVp64.score!)).toBe('0.1x');
    expect(groupBaseline(items, 'long', NOW)).toEqual({ baseline: 174.5, count: 12 });
  });
});

describe('groupBaseline', () => {
  it('returns null baseline under 5 posts', () => {
    expect(groupBaseline(mk([1, 2, 3]), 'long', NOW).baseline).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats 2.44 and 10.06', () => {
    expect(formatScore(2.44)).toBe('2.4x');
    expect(formatScore(10.06)).toBe('10.1x');
  });
  it('outlier at exactly 2.0', () => expect(isOutlier(2)).toBe(true));
  it('1.96 shows 2.0x and counts as an outlier (decided on the rounded value)', () => {
    expect(formatScore(1.96)).toBe('2.0x');
    expect(isOutlier(1.96)).toBe(true);
  });
  it('1.94 shows 1.9x and is not an outlier', () => {
    expect(formatScore(1.94)).toBe('1.9x');
    expect(isOutlier(1.94)).toBe(false);
  });
});

describe('compareByScore', () => {
  it('high to low, unscored last, ties newest first', () => {
    const rows = [
      { id: 'u', score: null, publishedAt: daysAgo(1) },
      { id: 'low', score: 0.5, publishedAt: daysAgo(5) },
      { id: 'tieOld', score: 2, publishedAt: daysAgo(30) },
      { id: 'tieNew', score: 2, publishedAt: daysAgo(10) },
      { id: 'top', score: 5, publishedAt: daysAgo(50) },
    ];
    expect(rows.sort(compareByScore).map((r) => r.id)).toEqual(['top', 'tieNew', 'tieOld', 'low', 'u']);
  });
});
