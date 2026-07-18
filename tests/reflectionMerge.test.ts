import { describe, it, expect } from 'vitest';
import { mergeConflictingText } from '@/lib/reflectionMerge';

describe('mergeConflictingText', () => {
  it('joins server text and draft text with a blank-line separator', () => {
    expect(mergeConflictingText('From Telegram.', 'My draft.')).toBe('From Telegram.\n\nMy draft.');
  });
  it('returns just the draft when the server side is empty', () => {
    expect(mergeConflictingText('', 'My draft.')).toBe('My draft.');
  });
  it('returns just the server text when the draft is empty', () => {
    expect(mergeConflictingText('From Telegram.', '')).toBe('From Telegram.');
  });
  it('returns empty when both sides are empty', () => {
    expect(mergeConflictingText('', '')).toBe('');
  });
});
