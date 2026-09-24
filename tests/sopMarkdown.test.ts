import { describe, it, expect } from 'vitest';
import { renderSopExport, sopEmDashWarning, sopFileName } from '@/lib/sopMarkdown';
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
    const md = renderSopExport(sop);
    expect(md).toContain('# Short-Form Script Structure');
    expect(md).toContain('**Version:** 1.0 (2026-09-24)');
    expect(md).toContain('## Goal');
    expect(md).toContain('## Principles');
    expect(md).toContain('## Steps');
    expect(md).toContain('## Checklist');
  });

  it('falls back to a placeholder when content is blank', () => {
    const md = renderSopExport(makeSop({ content: '' }));
    expect(md).toContain('_Not yet written._');
  });

  it('falls back to a placeholder when content is whitespace only', () => {
    const md = renderSopExport(makeSop({ content: '   ' }));
    expect(md).toContain('_Not yet written._');
  });

  it('includes footer branding (Q8)', () => {
    const md = renderSopExport(makeSop());
    expect(md).toContain('© Pocket Creative');
    expect(md).toContain('Brendan Ang');
  });

  it('lists System tags when present', () => {
    const md = renderSopExport(makeSop({ systems: ['Interest', 'Trust'] }));
    expect(md).toContain('**System:** Interest, Trust');
  });

  it('omits the System line when no systems are set', () => {
    const md = renderSopExport(makeSop({ systems: [] }));
    expect(md).not.toContain('**System:**');
  });

  it('handles special characters in content without breaking structure', () => {
    const sop = makeSop({ content: '## Goal\nHandle "quotes", <tags>, & special chars — safely.' });
    const md = renderSopExport(sop);
    expect(md).toContain('Handle "quotes", <tags>, & special chars — safely.');
  });
});

describe('sopFileName', () => {
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
