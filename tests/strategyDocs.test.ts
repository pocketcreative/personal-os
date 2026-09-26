import { describe, it, expect } from 'vitest';
import {
  checkContent, DEFAULT_DOC_KEY, DOC_OPTIONS, extractSections, isDocSlug, MAX_CONTENT_CHARS, parseDocParam, slugForKey, versionsToPrune,
} from '@/lib/strategyDocs';

describe('extractSections', () => {
  it('returns H2 and H3 lines in order, skipping H1 and H4', () => {
    const md = '# Title\n\n## One\ntext\n### Two\n#### Deep\n## Three\n';
    expect(extractSections(md)).toEqual([
      { level: 2, text: 'One' }, { level: 3, text: 'Two' }, { level: 2, text: 'Three' },
    ]);
  });
  it('ignores headings inside fenced code blocks', () => {
    const md = '## Real\n```\n## Not a heading\n```\n~~~\n### Also not\n~~~\n### Real too';
    expect(extractSections(md).map((s) => s.text)).toEqual(['Real', 'Real too']);
  });
  it('strips bold, links and code marks from the label', () => {
    const md = '### [**What we help you build**](https://x.com)\n## The Problem (**Why Agents Stay Stuck)**\n## `code` bit';
    expect(extractSections(md).map((s) => s.text)).toEqual([
      'What we help you build', 'The Problem (Why Agents Stay Stuck)', 'code bit',
    ]);
  });
  it('needs a space after the hashes and ignores empty headings', () => {
    expect(extractSections('##NoSpace\n## \n### ok')).toEqual([{ level: 3, text: 'ok' }]);
  });
  it('returns an empty list for empty text', () => {
    expect(extractSections('')).toEqual([]);
  });
});

describe('versionsToPrune', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, saved_at: new Date(2026, 0, 1, 0, i).toISOString() }));
  it('keeps everything when at or under the limit', () => {
    expect(versionsToPrune(mk(50), 50)).toEqual([]);
    expect(versionsToPrune(mk(3), 50)).toEqual([]);
  });
  it('drops the oldest ones beyond the limit', () => {
    // v0 is oldest, v51 newest (52 rows): the 2 oldest go
    expect(versionsToPrune(mk(52), 50).sort()).toEqual(['v0', 'v1']);
  });
  it('does not depend on input order', () => {
    const shuffled = [...mk(5)].reverse();
    expect(versionsToPrune(shuffled, 3).sort()).toEqual(['v0', 'v1']);
  });
});

describe('checkContent', () => {
  it('rejects non-text, empty and whitespace-only content with 400', () => {
    for (const bad of [undefined, null, 5, '', '   \n\t ']) {
      const r = checkContent(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }
  });
  it('accepts normal content unchanged, including leading and trailing spaces', () => {
    const r = checkContent('  hello\n');
    expect(r).toEqual({ ok: true, content: '  hello\n' });
  });
  it('accepts exactly the size cap and rejects one over', () => {
    expect(checkContent('a'.repeat(MAX_CONTENT_CHARS)).ok).toBe(true);
    expect(checkContent('a'.repeat(MAX_CONTENT_CHARS + 1)).ok).toBe(false);
  });
});

describe('document choices', () => {
  it('has three documents in the switch order with the right labels', () => {
    expect(DOC_OPTIONS.map((d) => d.label)).toEqual(['Target Audience', 'Workshop Offer', 'Partnership Offer']);
    expect(DOC_OPTIONS.map((d) => d.key)).toEqual(['target-audience', 'workshop-offer', 'partnership-offer']);
  });
  it('keeps the live database slug `offer` for the Partnership Offer', () => {
    expect(slugForKey('partnership-offer')).toBe('offer');
    expect(slugForKey('workshop-offer')).toBe('workshop-offer');
    expect(slugForKey('target-audience')).toBe('target-audience');
  });
  it('the API accepts exactly the three database slugs', () => {
    for (const ok of ['target-audience', 'workshop-offer', 'offer']) expect(isDocSlug(ok)).toBe(true);
    for (const bad of ['partnership-offer', 'nope', '', 'Offer']) expect(isDocSlug(bad)).toBe(false);
  });
});

describe('parseDocParam', () => {
  it('reads each new value', () => {
    expect(parseDocParam('target-audience')).toBe('target-audience');
    expect(parseDocParam('workshop-offer')).toBe('workshop-offer');
    expect(parseDocParam('partnership-offer')).toBe('partnership-offer');
  });
  it('maps the old ?doc=offer bookmark to the Partnership Offer', () => {
    expect(parseDocParam('offer')).toBe('partnership-offer');
  });
  it('falls back to Target Audience when missing or unknown', () => {
    for (const v of [undefined, null, '', 'nope', 'Offer', 'workshop']) expect(parseDocParam(v)).toBe(DEFAULT_DOC_KEY);
    expect(DEFAULT_DOC_KEY).toBe('target-audience');
  });
  it('uses the first value when the link repeats ?doc=', () => {
    expect(parseDocParam(['workshop-offer', 'offer'])).toBe('workshop-offer');
    expect(parseDocParam([])).toBe('target-audience');
  });
});
