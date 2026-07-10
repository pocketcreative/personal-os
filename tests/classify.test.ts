import { describe, it, expect } from 'vitest';
import { parseClassification, regexClassify } from '@/lib/ai/classify';

describe('parseClassification', () => {
  it('parses valid JSON, even wrapped in prose', () => {
    const raw = 'Here you go: {"kind":"task","priority":"today","category":"business","tags":["content"],"summary":"Film reel","time_estimate_min":45}';
    const c = parseClassification(raw)!;
    expect(c.kind).toBe('task');
    expect(c.priority).toBe('today');
    expect(c.category).toBe('business');
    expect(c.time_estimate_min).toBe(45);
    expect(c.low_confidence).toBe(false);
  });
  it('rejects invalid enums and empty summaries', () => {
    expect(parseClassification('{"kind":"meal","priority":"today","category":"personal","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","priority":"whenever","category":"personal","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","priority":"today","category":"hobby","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","priority":"today","category":"personal","summary":""}')).toBeNull();
    expect(parseClassification('not json')).toBeNull();
  });
  it('defaults category to personal when the model omits it', () => {
    const raw = '{"kind":"task","priority":"today","summary":"x"}';
    const c = parseClassification(raw)!;
    expect(c.category).toBe('personal');
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
