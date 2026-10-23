import { describe, it, expect } from 'vitest';
import { validateSlug, renameFrontmatterName } from '@/lib/skillFile';

describe('validateSlug', () => {
  it('accepts normal names', () => {
    expect(validateSlug('zz-rename-test-2')).toBeNull();
    expect(validateSlug('ab')).toBeNull();
    expect(validateSlug('a'.repeat(64))).toBeNull();
  });
  it.each([
    ['uppercase', 'Reel-Editor'],
    ['spaces', 'reel editor'],
    ['underscores', 'reel_editor'],
    ['leading dash', '-reel'],
    ['trailing dash', 'reel-'],
    ['double dash', 'reel--editor'],
    ['one character', 'a'],
    ['65 characters', 'a'.repeat(65)],
    ['reserved synced', 'synced'],
    ['reserved node_modules', 'node_modules'],
    ['leading dot', '.hidden'],
  ])('rejects %s', (_label, s) => {
    expect(validateSlug(s)).not.toBeNull();
  });
});

describe('renameFrontmatterName', () => {
  const doc = '---\nname: old-name\ndescription: does a thing\n---\n# Body\nname: not-this\n';
  it('changes only the name line', () => {
    expect(renameFrontmatterName(doc, 'new-name'))
      .toBe('---\nname: new-name\ndescription: does a thing\n---\n# Body\nname: not-this\n');
  });
  it('keeps CRLF line endings', () => {
    const crlf = '---\r\nname: old\r\ndescription: x\r\n---\r\nBody\r\n';
    expect(renameFrontmatterName(crlf, 'new')).toBe('---\r\nname: new\r\ndescription: x\r\n---\r\nBody\r\n');
  });
  it('keeps the quoting style', () => {
    expect(renameFrontmatterName('---\nname: "old"\n---\nx', 'new')).toBe('---\nname: "new"\n---\nx');
    expect(renameFrontmatterName("---\nname: 'old'\n---\nx", 'new')).toBe("---\nname: 'new'\n---\nx");
  });
  it('inserts a name line when the block has none', () => {
    expect(renameFrontmatterName('---\ndescription: x\n---\nBody', 'new')).toBe('---\nname: new\ndescription: x\n---\nBody');
  });
  it('is a no-op without frontmatter', () => {
    const plain = '# Title\nname: old\n';
    expect(renameFrontmatterName(plain, 'new')).toBe(plain);
  });
  it('does not touch a name: in the body when the block has none', () => {
    const out = renameFrontmatterName('---\ndescription: x\n---\nname: body\n', 'new');
    expect(out).toBe('---\nname: new\ndescription: x\n---\nname: body\n');
  });
  it('only edits the first --- block', () => {
    const two = '---\nname: old\n---\nText\n---\nname: later\n---\n';
    expect(renameFrontmatterName(two, 'new')).toBe('---\nname: new\n---\nText\n---\nname: later\n---\n');
  });
  it('replaces a folded name: value whole', () => {
    const folded = '---\nname: >-\n  old\ndescription: x\n---\nBody';
    expect(renameFrontmatterName(folded, 'new')).toBe('---\nname: new\ndescription: x\n---\nBody');
  });
  it('handles a BOM at the start of the file', () => {
    const bom = '\uFEFF---\nname: old\n---\nBody';
    expect(renameFrontmatterName(bom, 'new')).toBe('\uFEFF---\nname: new\n---\nBody');
  });
});
