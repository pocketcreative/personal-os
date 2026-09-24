import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256, readTrigger, hasTrigger, codeBlockSmartCharWarning } from '@/lib/skillFile';

describe('sha256', () => {
  it('hashes the exact bytes handed in', () => {
    const content = '---\ndescription: test\n---\nBody text.\n';
    expect(sha256(content)).toBe(createHash('sha256').update(content, 'utf8').digest('hex'));
  });
  it('is sensitive to any byte difference (a single trailing newline)', () => {
    expect(sha256('abc')).not.toBe(sha256('abc\n'));
  });
});

describe('readTrigger', () => {
  it('reads a single-line description', () => {
    const content = '---\nname: my-skill\ndescription: Use this when the user asks for X.\n---\nBody.';
    expect(readTrigger(content)).toBe('Use this when the user asks for X.');
  });
  it('folds a wrapped/multi-line description into one string', () => {
    const content = '---\ndescription: Use this when the user asks for X,\n  or mentions Y, or wants Z.\nname: my-skill\n---\nBody.';
    expect(readTrigger(content)).toBe('Use this when the user asks for X, or mentions Y, or wants Z.');
  });
  it('returns null when there is no frontmatter', () => {
    expect(readTrigger('Just a plain markdown file, no frontmatter.')).toBeNull();
  });
  it('returns null when frontmatter has no description line', () => {
    const content = '---\nname: my-skill\n---\nBody.';
    expect(readTrigger(content)).toBeNull();
  });
  it('strips surrounding quotes', () => {
    const content = '---\ndescription: "Quoted trigger text."\n---\nBody.';
    expect(readTrigger(content)).toBe('Quoted trigger text.');
  });
});

describe('hasTrigger', () => {
  it('mirrors readTrigger presence', () => {
    expect(hasTrigger('---\ndescription: X\n---\nBody.')).toBe(true);
    expect(hasTrigger('---\nname: x\n---\nBody.')).toBe(false);
  });
});

describe('codeBlockSmartCharWarning', () => {
  it('warns on a curly quote inside a fenced code block', () => {
    const content = 'Text.\n```\nconst x = “hello”;\n```\n';
    expect(codeBlockSmartCharWarning(content)).not.toBeNull();
  });
  it('warns on an em dash inside inline backticks', () => {
    const content = 'Run `node script.mjs — flag` to do the thing.';
    expect(codeBlockSmartCharWarning(content)).not.toBeNull();
  });
  it('does not warn on an em dash outside any code span', () => {
    const content = 'This is prose — not code. Run `node script.mjs --flag` for real.';
    expect(codeBlockSmartCharWarning(content)).toBeNull();
  });
  it('returns null for clean content', () => {
    expect(codeBlockSmartCharWarning('All plain ASCII, nothing smart here.')).toBeNull();
  });
});
