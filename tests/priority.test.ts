import { describe, it, expect } from 'vitest';
import { mergeRanks } from '@/lib/priority';

const t = (id: string, score: number, pinned = false) =>
  ({ id, priority_score: score, rank_pinned: pinned });

describe('mergeRanks', () => {
  it('assigns descending scores per AI order to unpinned tasks', () => {
    const updates = mergeRanks([t('a', 700), t('b', 700), t('c', 700)], ['c', 'a', 'b']);
    expect(updates).toEqual([
      { id: 'c', priority_score: 1000 },
      { id: 'a', priority_score: 990 },
      { id: 'b', priority_score: 980 },
    ]);
  });
  it('never touches pinned tasks', () => {
    const updates = mergeRanks([t('a', 700), t('pin', 850, true)], ['pin', 'a']);
    expect(updates.find((u) => u.id === 'pin')).toBeUndefined();
    expect(updates.find((u) => u.id === 'a')).toBeDefined();
  });
  it('ignores hallucinated ids and appends unpinned tasks the AI forgot', () => {
    const updates = mergeRanks([t('a', 700), t('b', 700)], ['ghost', 'a']);
    expect(updates.map((u) => u.id)).toEqual(['a', 'b']);
  });
  it('deduplicates a repeated id instead of shifting every later rank down', () => {
    const updates = mergeRanks([t('a', 700), t('b', 700), t('c', 700)], ['a', 'a', 'b', 'c']);
    expect(updates).toEqual([
      { id: 'a', priority_score: 1000 },
      { id: 'b', priority_score: 990 },
      { id: 'c', priority_score: 980 },
    ]);
  });
});
