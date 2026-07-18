import { describe, it, expect } from 'vitest';
import { mergeConflictingText } from '@/lib/reflectionMerge';

describe('mergeConflictingText', () => {
  it('joins server text and draft text with a blank-line separator', () => {
    expect(mergeConflictingText('From Telegram.', 'My draft.', '')).toBe('From Telegram.\n\nMy draft.');
  });
  it('returns just the draft when the server side is empty', () => {
    expect(mergeConflictingText('', 'My draft.', '')).toBe('My draft.');
  });
  it('returns just the server text when the draft is empty', () => {
    expect(mergeConflictingText('From Telegram.', '', '')).toBe('From Telegram.');
  });
  it('returns empty when both sides are empty', () => {
    expect(mergeConflictingText('', '', '')).toBe('');
  });

  it('strips the shared ancestor prefix from the draft so it is not duplicated', () => {
    // serverText and draftText both grew from the same prior save ("Morning
    // note."), which is the normal shape of every real 409 conflict. Naively
    // concatenating both sides would duplicate that shared prefix.
    const result = mergeConflictingText(
      'Morning note.\n\nTelegram msg 1',
      'Morning note. Adding more.',
      'Morning note.'
    );
    expect(result).toBe('Morning note.\n\nTelegram msg 1\n\nAdding more.');
    expect(result.match(/Morning note\./g)?.length).toBe(1);
  });

  it('returns a single copy when server and draft are identical after trimming (no duplication)', () => {
    expect(mergeConflictingText('X', 'X', '')).toBe('X');
  });

  it('treats a whitespace-only draft as empty and returns just the server text', () => {
    expect(mergeConflictingText('From Telegram.', '   ', '')).toBe('From Telegram.');
  });

  it('treats whitespace-only server text as empty and returns just the draft', () => {
    expect(mergeConflictingText('   ', 'My draft.', '')).toBe('My draft.');
  });
});
