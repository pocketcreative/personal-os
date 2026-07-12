import { describe, it, expect } from 'vitest';
import { parseClassifications, regexClassify } from '@/lib/ai/classify';

describe('parseClassifications', () => {
  it('parses valid JSON, even wrapped in prose', () => {
    const raw = 'Here you go: {"items":[{"kind":"task","priority":"today","category":"business","tags":["content"],"summary":"Film reel","time_estimate_min":45}]}';
    const items = parseClassifications(raw)!;
    expect(items).toHaveLength(1);
    const c = items[0];
    expect(c.kind).toBe('task');
    expect(c.priority).toBe('today');
    expect(c.category).toBe('business');
    expect(c.time_estimate_min).toBe(45);
    expect(c.low_confidence).toBe(false);
  });

  it('parses a multi-item response into a 2+ element array, each item independently valid', () => {
    const raw = JSON.stringify({
      items: [
        { kind: 'task', priority: 'today', category: 'business', tags: ['email'], summary: 'Email client about invoice', time_estimate_min: 15 },
        { kind: 'task', priority: 'dash', category: 'business', tags: ['docs'], summary: 'Update project README', time_estimate_min: 60 },
      ],
    });
    const items = parseClassifications(raw)!;
    expect(items).toHaveLength(2);
    expect(items[0].summary).toBe('Email client about invoice');
    expect(items[0].time_estimate_min).toBe(15);
    expect(items[1].summary).toBe('Update project README');
    expect(items[1].time_estimate_min).toBe(60);
    for (const c of items) {
      expect(['task', 'journal', 'goal']).toContain(c.kind);
      expect(['today', 'dash']).toContain(c.priority);
      expect(['personal', 'business']).toContain(c.category);
      expect(c.low_confidence).toBe(false);
    }
  });

  it('filters out an invalid item while keeping the valid one, rather than failing entirely', () => {
    const raw = JSON.stringify({
      items: [
        { kind: 'task', priority: 'today', category: 'personal', summary: 'Valid item' },
        { kind: 'meal', priority: 'today', category: 'personal', summary: 'Invalid kind' },
      ],
    });
    const items = parseClassifications(raw)!;
    expect(items).toHaveLength(1);
    expect(items[0].summary).toBe('Valid item');
  });

  it('rejects invalid enums and empty summaries (single-item case, all filtered out -> null)', () => {
    expect(parseClassifications('{"items":[{"kind":"meal","priority":"today","category":"personal","summary":"x"}]}')).toBeNull();
    expect(parseClassifications('{"items":[{"kind":"task","priority":"whenever","category":"personal","summary":"x"}]}')).toBeNull();
    expect(parseClassifications('{"items":[{"kind":"task","priority":"today","category":"hobby","summary":"x"}]}')).toBeNull();
    expect(parseClassifications('{"items":[{"kind":"task","priority":"today","category":"personal","summary":""}]}')).toBeNull();
    expect(parseClassifications('not json')).toBeNull();
  });

  it('returns null when items is missing, empty, or not an array', () => {
    expect(parseClassifications('{"items":[]}')).toBeNull();
    expect(parseClassifications('{"foo":"bar"}')).toBeNull();
    expect(parseClassifications('{"items":"nope"}')).toBeNull();
  });

  it('defaults category to personal when the model omits it', () => {
    const raw = '{"items":[{"kind":"task","priority":"today","summary":"x"}]}';
    const items = parseClassifications(raw)!;
    expect(items[0].category).toBe('personal');
  });

  it('truncates tags to 3 and summary to 120 chars', () => {
    const longSummary = 'x'.repeat(200);
    const raw = JSON.stringify({
      items: [{ kind: 'task', priority: 'today', category: 'personal', tags: ['a', 'b', 'c', 'd'], summary: longSummary }],
    });
    const items = parseClassifications(raw)!;
    expect(items[0].tags).toHaveLength(3);
    expect(items[0].summary).toHaveLength(120);
  });

  it('parses description_points from a valid LLM response', () => {
    const raw = JSON.stringify({
      items: [{
        kind: 'task', priority: 'today', category: 'business', summary: 'Redesign intake form',
        description_points: ['Collect business name', 'Collect main goal', 'Add confirmation email'],
      }],
    });
    const items = parseClassifications(raw)!;
    expect(items[0].description_points).toEqual(['Collect business name', 'Collect main goal', 'Add confirmation email']);
  });

  it('defaults description_points to [] when absent or malformed', () => {
    const noField = parseClassifications('{"items":[{"kind":"task","priority":"today","category":"personal","summary":"x"}]}')!;
    expect(noField[0].description_points).toEqual([]);

    const notArray = parseClassifications(JSON.stringify({
      items: [{ kind: 'task', priority: 'today', category: 'personal', summary: 'x', description_points: 'not an array' }],
    }))!;
    expect(notArray[0].description_points).toEqual([]);
  });

  it('caps description_points at 6 items, filters non-strings, trims, and caps item length at 200 chars', () => {
    const longPoint = 'y'.repeat(300);
    const raw = JSON.stringify({
      items: [{
        kind: 'task', priority: 'today', category: 'personal', summary: 'x',
        description_points: ['  a  ', 'b', 3, 'c', 'd', 'e', 'f', 'g', longPoint],
      }],
    });
    const items = parseClassifications(raw)!;
    const points = items[0].description_points;
    expect(points.length).toBeLessThanOrEqual(6);
    expect(points).toContain('a');
    expect(points.every((p) => typeof p === 'string')).toBe(true);
    expect(points.every((p) => p.length <= 200)).toBe(true);
  });
});

describe('regexClassify', () => {
  it('flags low confidence and defaults to task/dash/personal', () => {
    const c = regexClassify('send the proposal to the client');
    expect(c.kind).toBe('task');
    expect(c.priority).toBe('dash');
    expect(c.category).toBe('personal');
    expect(c.low_confidence).toBe(true);
  });
  it('detects today priority, journal kind, and business category', () => {
    expect(regexClassify('need to do this today asap').priority).toBe('today');
    expect(regexClassify('journal: today went well, felt focused').kind).toBe('journal');
    expect(regexClassify('email the client about the invoice').category).toBe('business');
  });
  it('returns empty description_points (no summarization capability in the fallback)', () => {
    expect(regexClassify('send the proposal to the client').description_points).toEqual([]);
  });
});
