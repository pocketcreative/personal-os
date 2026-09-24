import { describe, it, expect } from 'vitest';
import { filterForAudience, renderSopExport, sopEmDashWarning, sopFileName } from '@/lib/sopMarkdown';
import type { Sop } from '@/lib/types';

function makeSop(overrides: Partial<Sop> = {}): Sop {
  return {
    id: 'test-id',
    user_id: 'brendan',
    title: 'Short-Form Script Structure',
    version: '1.0',
    version_date: '2026-09-24',
    content: '## Goal\nGet a filming-ready short-form script every time.\n\n## Principles\nHook first. Never bury the point.\n\n## Steps\n1. Pick the moment.\n2. Write the hook.\n\n## Checklist\n- [ ] Hook written\n- [ ] EIL body written',
    systems: ['Interest', 'Trust'],
    skill_id: null,
    status: 'active',
    progress: 'active',
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

describe('renderSopExport', () => {
  it('includes the title, version metadata, and content body', () => {
    const sop = makeSop();
    const md = renderSopExport(sop, 'internal');
    expect(md).toContain('# Short-Form Script Structure');
    expect(md).toContain('**Version:** 1.0 (2026-09-24)');
    expect(md).toContain('## Goal');
    expect(md).toContain('## Principles');
    expect(md).toContain('## Steps');
    expect(md).toContain('## Checklist');
  });

  it('falls back to a placeholder when content is blank', () => {
    const md = renderSopExport(makeSop({ content: '' }), 'internal');
    expect(md).toContain('_Not yet written._');
  });

  it('falls back to a placeholder when content is whitespace only', () => {
    const md = renderSopExport(makeSop({ content: '   ' }), 'internal');
    expect(md).toContain('_Not yet written._');
  });

  it('includes footer branding (Q8)', () => {
    const md = renderSopExport(makeSop(), 'internal');
    expect(md).toContain('© Pocket Creative');
    expect(md).toContain('Brendan Ang');
  });

  it('lists System tags when present', () => {
    const md = renderSopExport(makeSop({ systems: ['Interest', 'Trust'] }), 'internal');
    expect(md).toContain('**System:** Interest, Trust');
  });

  it('omits the System line when no systems are set', () => {
    const md = renderSopExport(makeSop({ systems: [] }), 'internal');
    expect(md).not.toContain('**System:**');
  });

  it('handles special characters in content without breaking structure', () => {
    const sop = makeSop({ content: '## Goal\nHandle "quotes", <tags>, & special chars — safely.' });
    const md = renderSopExport(sop, 'internal');
    expect(md).toContain('Handle "quotes", <tags>, & special chars — safely.');
  });
});

describe('filterForAudience', () => {
  const doc = [
    '## Steps',
    'Shared line.',
    '- [Internal] Ask Jarvis to cut silences',
    '- [Client] Send the raw file to the editor',
    '  * [CLIENT] Nested client item',
  ].join('\n');

  it('keeps shared lines in both audiences', () => {
    expect(filterForAudience(doc, 'internal')).toContain('Shared line.');
    expect(filterForAudience(doc, 'client')).toContain('Shared line.');
    expect(filterForAudience(doc, 'internal')).toContain('## Steps');
  });

  it('[Internal] lines appear only in the internal output', () => {
    expect(filterForAudience(doc, 'internal')).toContain('Ask Jarvis to cut silences');
    expect(filterForAudience(doc, 'client')).not.toContain('Ask Jarvis');
  });

  it('[Client] lines appear only in the client output', () => {
    expect(filterForAudience(doc, 'client')).toContain('Send the raw file to the editor');
    expect(filterForAudience(doc, 'internal')).not.toContain('Send the raw file');
  });

  it('removes the tag and keeps the list marker and indentation', () => {
    expect(filterForAudience(doc, 'internal')).toContain('- Ask Jarvis to cut silences');
    expect(filterForAudience(doc, 'client')).toContain('  * Nested client item');
    expect(filterForAudience('1. [Client] Do it', 'client')).toBe('1. Do it');
    expect(filterForAudience('[Internal] Plain line', 'internal')).toBe('Plain line');
  });

  it('matches the tag word case-insensitively', () => {
    expect(filterForAudience('[internal] a\n[INTERNAL] b', 'internal')).toBe('a\nb');
    expect(filterForAudience('[internal] a\n[INTERNAL] b', 'client')).toBe('');
  });

  it('supports a bold marker before the tag', () => {
    expect(filterForAudience('- **[Internal] Note**', 'internal')).toBe('- **Note**');
  });

  it('leaves a tag mid-line untouched', () => {
    const line = 'Use the [Internal] label sparingly';
    expect(filterForAudience(line, 'internal')).toBe(line);
    expect(filterForAudience(line, 'client')).toBe(line);
  });

  it('never touches tagged lines inside a code fence', () => {
    const fenced = ['```', '[Internal] keep me exact', '[Client] me too', '```'].join('\n');
    expect(filterForAudience(fenced, 'internal')).toBe(fenced);
    expect(filterForAudience(fenced, 'client')).toBe(fenced);
  });

  it('resumes filtering after a code fence closes', () => {
    const md = ['```', 'x', '```', '[Client] out'].join('\n');
    expect(filterForAudience(md, 'internal')).toBe('```\nx\n```');
  });

  it('collapses blank-line runs left by dropped lines but keeps headings', () => {
    const md = ['## A', '', '[Internal] only internal', '', '## B', 'text'].join('\n');
    expect(filterForAudience(md, 'client')).toBe('## A\n\n## B\ntext');
  });

  it('keeps blank lines inside code fences exact', () => {
    const fenced = ['```', 'a', '', '', '', 'b', '```'].join('\n');
    expect(filterForAudience(fenced, 'client')).toBe(fenced);
  });
});

describe('renderSopExport audience', () => {
  const content = 'Shared.\n- [Internal] Internal step\n- [Client] Client step';
  it('applies the audience filter to the content body', () => {
    const internal = renderSopExport(makeSop({ content }), 'internal');
    const client = renderSopExport(makeSop({ content }), 'client');
    expect(internal).toContain('- Internal step');
    expect(internal).not.toContain('Client step');
    expect(client).toContain('- Client step');
    expect(client).not.toContain('Internal step');
  });
});

describe('sopFileName', () => {
  it('adds an audience suffix when given', () => {
    expect(sopFileName(makeSop({ title: 'My SOP', version: '2.0' }), 'client')).toBe('my-sop-v2.0-client.md');
    expect(sopFileName(makeSop({ title: 'My SOP', version: '2.0' }), 'internal')).toBe('my-sop-v2.0-internal.md');
  });
  it('slugifies the title and appends the version', () => {
    expect(sopFileName(makeSop({ title: 'Short-Form Script Structure', version: '1.3' })))
      .toBe('short-form-script-structure-v1.3.md');
  });
  it('falls back to a safe name for an empty title', () => {
    expect(sopFileName(makeSop({ title: '   ' }))).toBe('untitled-sop-v1.0.md');
  });
});

describe('sopEmDashWarning', () => {
  it('warns when an em dash appears anywhere in title or content', () => {
    const warning = sopEmDashWarning({ title: 'A Title', content: 'This has an em dash — right here.' });
    expect(warning).not.toBeNull();
  });
  it('returns null when there is no em dash', () => {
    const warning = sopEmDashWarning({ title: 'A Title', content: 'Clean text, no dashes of that kind.' });
    expect(warning).toBeNull();
  });
});
