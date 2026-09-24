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
    goal: 'Get a filming-ready short-form script every time.',
    principles: 'Hook first. Never bury the point.',
    steps: '1. Pick the moment.\n2. Write the hook.',
    example: null,
    checklist: '- [ ] Hook written\n- [ ] EIL body written',
    systems: ['Interest', 'Trust'],
    skill_id: null,
    status: 'active',
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

describe('renderSopExport', () => {
  it('includes all 7 sections when example is filled', () => {
    const sop = makeSop({ example: 'A real worked example goes here.' });
    const md = renderSopExport(sop);
    expect(md).toContain('# Short-Form Script Structure');
    expect(md).toContain('**Version:** 1.0 (2026-09-24)');
    expect(md).toContain('## Goal');
    expect(md).toContain('## Principles');
    expect(md).toContain('## Steps');
    expect(md).toContain('## Example');
    expect(md).toContain('A real worked example goes here.');
    expect(md).toContain('## Checklist');
  });

  it('omits the Example heading entirely when example is null (Q9)', () => {
    const md = renderSopExport(makeSop({ example: null }));
    expect(md).not.toContain('## Example');
  });

  it('omits the Example heading when example is blank/whitespace', () => {
    const md = renderSopExport(makeSop({ example: '   ' }));
    expect(md).not.toContain('## Example');
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
    const sop = makeSop({ goal: 'Handle "quotes", <tags>, & special chars — safely.' });
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
  it('warns when an em dash appears anywhere in the content fields', () => {
    const warning = sopEmDashWarning({
      title: 'A Title', goal: 'This has an em dash — right here.', principles: '', steps: '', example: null, checklist: '',
    });
    expect(warning).not.toBeNull();
  });
  it('returns null when there is no em dash', () => {
    const warning = sopEmDashWarning({
      title: 'A Title', goal: 'Clean text, no dashes of that kind.', principles: '', steps: '', example: null, checklist: '',
    });
    expect(warning).toBeNull();
  });
});
