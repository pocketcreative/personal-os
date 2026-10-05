import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS, filterRows, isFiltered, parseFilters, parseTab, buildQuery, type Filters,
} from '@/lib/outlierFilters';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

interface Row { id: string; outlierScore: number | null; publishedAt: string | null; text: string }
const r = (id: string, outlierScore: number | null, publishedAt: string | null, text = id): Row => ({ id, outlierScore, publishedAt, text });
const f = (o: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...o });
const run = (rows: Row[], o: Partial<Filters>) => filterRows(rows, f(o), (x) => x.text, NOW).map((x) => x.id);

const rows: Row[] = [
  r('hot', 3.2, ago(10), 'How I Booked 5 Exclusives'),
  r('ok', 1.2, ago(50), 'Lead gen basics'),
  r('low', 0.4, ago(200), 'Old Ad Tips'),
  r('unlisted', null, ago(5), 'LF2 unlisted'),
  r('nodate', 2.5, null, 'No date video'),
];

describe('score filter', () => {
  it('All keeps every row, including unscored', () => {
    expect(run(rows, {})).toEqual(['hot', 'ok', 'low', 'unlisted', 'nodate']);
  });
  it('2x and up', () => expect(run(rows, { score: '2x' })).toEqual(['hot', 'nodate']));
  it('1x and up', () => expect(run(rows, { score: '1x' })).toEqual(['hot', 'ok', 'nodate']));
  it('Below 1x', () => expect(run(rows, { score: 'below1' })).toEqual(['low']));
  it('unscored rows never show under a score chip', () => {
    for (const s of ['2x', '1x', 'below1'] as const) expect(run(rows, { score: s })).not.toContain('unlisted');
  });
  it('uses the rounded value like the pill: 1.96 counts as 2x, 1.94 does not', () => {
    const edge = [r('a', 1.96, ago(20)), r('b', 1.94, ago(20))];
    expect(run(edge, { score: '2x' })).toEqual(['a']);
    expect(run(edge, { score: '1x' })).toEqual(['a', 'b']);
  });
  it('0.96 rounds to 1.0x so it is 1x and up, not below 1x; 0.94 is below 1x', () => {
    const edge = [r('a', 0.96, ago(20)), r('b', 0.94, ago(20))];
    expect(run(edge, { score: '1x' })).toEqual(['a']);
    expect(run(edge, { score: 'below1' })).toEqual(['b']);
  });
  it('exactly 2 and exactly 1 are included', () => {
    const edge = [r('two', 2, ago(1)), r('one', 1, ago(1))];
    expect(run(edge, { score: '2x' })).toEqual(['two']);
    expect(run(edge, { score: '1x' })).toEqual(['two', 'one']);
  });
});

describe('time window', () => {
  it('30 days is inclusive at the boundary', () => {
    const edge = [r('on', 1, ago(30)), r('out', 1, new Date(NOW - 30 * DAY - 1).toISOString()), r('in', 1, ago(29))];
    expect(run(edge, { window: '30d' })).toEqual(['on', 'in']);
  });
  it('90 days and 12 months (365 days)', () => {
    expect(run(rows, { window: '90d' })).toEqual(['hot', 'ok', 'unlisted']);
    expect(run(rows, { window: '12m' })).toEqual(['hot', 'ok', 'low', 'unlisted']);
  });
  it('rows with no date are dropped by any window but kept under All time', () => {
    expect(run(rows, { window: '12m' })).not.toContain('nodate');
    expect(run(rows, { window: 'all' })).toContain('nodate');
  });
  it('a row dated in the future still counts as inside the window', () => {
    expect(run([r('future', 1, new Date(NOW + DAY).toISOString())], { window: '30d' })).toEqual(['future']);
  });
});

describe('search', () => {
  it('matches case-insensitively', () => expect(run(rows, { q: 'EXCLUSIVES' })).toEqual(['hot']));
  it('matches part of a word and ignores outer spaces', () => expect(run(rows, { q: '  lead ' })).toEqual(['ok']));
  it('empty or spaces-only search keeps everything', () => {
    expect(run(rows, { q: '   ' })).toHaveLength(5);
  });
  it('no match returns nothing', () => expect(run(rows, { q: 'zzz' })).toEqual([]));
  it('does not treat special characters as a pattern', () => {
    expect(run([r('x', 1, ago(1), 'a (b) c.*')], { q: '.*' })).toEqual(['x']);
  });
});

describe('combinations', () => {
  it('score and window and search all have to pass', () => {
    expect(run(rows, { score: '1x', window: '90d' })).toEqual(['hot', 'ok']);
    expect(run(rows, { score: '1x', window: '90d', q: 'basics' })).toEqual(['ok']);
    expect(run(rows, { score: '2x', window: '30d', q: 'lead' })).toEqual([]);
  });
  it('does not change the input rows or their scores', () => {
    const copy = JSON.stringify(rows);
    run(rows, { score: '2x', window: '30d', q: 'a' });
    expect(JSON.stringify(rows)).toBe(copy);
  });
  it('empty input gives empty output', () => expect(run([], { score: '2x' })).toEqual([]));
});

describe('isFiltered and clear', () => {
  it('default is not filtered, any change is', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered(f({ score: '2x' }))).toBe(true);
    expect(isFiltered(f({ window: '30d' }))).toBe(true);
    expect(isFiltered(f({ q: 'x' }))).toBe(true);
    expect(isFiltered(f({ q: '   ' }))).toBe(false);
  });
  it('clearing (back to default) restores every row', () => {
    expect(run(rows, { ...DEFAULT_FILTERS })).toHaveLength(rows.length);
  });
});

describe('URL helpers', () => {
  it('parseTab defaults to youtube', () => {
    expect(parseTab(undefined)).toBe('youtube');
    expect(parseTab('instagram')).toBe('instagram');
    expect(parseTab('nonsense')).toBe('youtube');
  });
  it('parseFilters falls back on bad values', () => {
    expect(parseFilters({ score: '2x', window: '90d', q: 'hi' })).toEqual({ score: '2x', window: '90d', q: 'hi' });
    expect(parseFilters({ score: 'bad', window: null, q: undefined })).toEqual(DEFAULT_FILTERS);
  });
  it('buildQuery is empty for defaults and round-trips', () => {
    expect(buildQuery('youtube', DEFAULT_FILTERS)).toBe('');
    const q = buildQuery('instagram', { score: 'below1', window: '12m', q: 'a b&c' });
    expect(q).toBe('?tab=instagram&score=below1&window=12m&q=a+b%26c');
    const p = new URLSearchParams(q);
    expect(parseTab(p.get('tab'))).toBe('instagram');
    expect(parseFilters({ score: p.get('score'), window: p.get('window'), q: p.get('q') })).toEqual({ score: 'below1', window: '12m', q: 'a b&c' });
  });
});
