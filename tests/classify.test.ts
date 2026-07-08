import { describe, it, expect } from 'vitest';
import { parseClassification, regexClassify } from '@/lib/ai/classify';

describe('parseClassification', () => {
  it('parses valid JSON, even wrapped in prose', () => {
    const raw = 'Here you go: {"kind":"task","urgency":"today","tags":["content"],"summary":"Film reel","time_estimate_min":45}';
    const c = parseClassification(raw)!;
    expect(c.kind).toBe('task');
    expect(c.urgency).toBe('today');
    expect(c.time_estimate_min).toBe(45);
    expect(c.low_confidence).toBe(false);
  });
  it('rejects invalid enums and empty summaries', () => {
    expect(parseClassification('{"kind":"meal","urgency":"today","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","urgency":"whenever","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","urgency":"today","summary":""}')).toBeNull();
    expect(parseClassification('not json')).toBeNull();
  });
});

describe('regexClassify', () => {
  it('flags low confidence and defaults to task/this_week', () => {
    const c = regexClassify('send the proposal to the client');
    expect(c.kind).toBe('task');
    expect(c.urgency).toBe('this_week');
    expect(c.low_confidence).toBe(true);
  });
  it('detects today urgency and journal kind', () => {
    expect(regexClassify('need to do this today asap').urgency).toBe('today');
    expect(regexClassify('journal: today went well, felt focused').kind).toBe('journal');
  });
});
