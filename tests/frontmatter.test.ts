import { describe, it, expect } from 'vitest';
import { splitFrontmatter } from '@/lib/frontmatter';

describe('splitFrontmatter', () => {
  it('splits header (with following blank lines) from body, byte for byte', () => {
    const content = '---\nname: x\ndescription: y\n---\n\n# Title\n\nBody.\n';
    const { header, body } = splitFrontmatter(content);
    expect(header).toBe('---\nname: x\ndescription: y\n---\n\n');
    expect(body).toBe('# Title\n\nBody.\n');
    expect(header + body).toBe(content);
  });
  it('returns an empty header when there is no frontmatter', () => {
    const content = '## Goal\n\n---\n\nText';
    expect(splitFrontmatter(content)).toEqual({ header: '', body: content });
  });
  it('keeps CRLF files intact', () => {
    const content = '---\r\nname: x\r\n---\r\n\r\nBody\r\n';
    const { header, body } = splitFrontmatter(content);
    expect(header + body).toBe(content);
    expect(body).toBe('Body\r\n');
  });
  it('only takes the first block when a file has a second one in its body', () => {
    const content = '---\nname: a\n---\n\n---\nname: a\n---\n\n# T\n';
    const { header, body } = splitFrontmatter(content);
    expect(header).toBe('---\nname: a\n---\n\n');
    expect(body).toBe('---\nname: a\n---\n\n# T\n');
  });
  it('does not eat indentation on the first body line', () => {
    const content = '---\nname: a\n---\n   indented\n';
    expect(splitFrontmatter(content).body).toBe('   indented\n');
  });
});
