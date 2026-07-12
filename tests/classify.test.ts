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
});
