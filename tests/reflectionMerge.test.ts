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

  it('collapses two different whitespace-only strings that trim-equal, rather than returning raw whitespace', () => {
    // Locks in the whitespace fix: '  ' and ' ' are not identical strings,
    // but both trim to '' -- the result must be '', not one side's leftover
    // whitespace leaking through.
    expect(mergeConflictingText('  ', ' ', '')).toBe('');
  });

  it('regression: falls back to the full draft (not empty) when the draft adds nothing new beyond the ancestor and the server side is empty', () => {
    // Guards the `draftAdditionTrimmed || draftTrimmed` fallback. Here the
    // draft is exactly the ancestor (no new content typed past it), so
    // stripping the ancestor prefix leaves '' -- without falling back to
    // draftTrimmed, this would silently return '' and lose the draft's
    // actual (unedited) content, even though the server side has nothing
    // to fall back to either.
    expect(mergeConflictingText('', 'Morning note.', 'Morning note.')).toBe('Morning note.');
  });

  it('KNOWN LIMITATION (accepted, not a bug): mid-span edits within the previously-saved text fall back to full concatenation, duplicating rather than losing the overlap', () => {
    // The ancestor-stripping heuristic only recognizes pure appends: it
    // requires draftText to literally *start with* ancestorText. If the
    // user edits a word WITHIN the previously-saved span during the
    // conflict window (here, "coffee" -> "tea") rather than only typing
    // more after it, draftText no longer has ancestorText as a string
    // prefix, so this pins the current, deliberate fallback: concatenate
    // both sides in full. The overlapping text ends up duplicated, but
    // every character from both sides is still present -- no data is lost.
    // This is an accepted tradeoff for this app's scale (see the
    // docstring and docs/superpowers/specs/2026-07-18-habits-reflections-enhancements-design.md,
    // section 5), not something to "fix" with a diff algorithm later.
    const serverText = 'Morning note about coffee.\n\nTelegram msg 1';
    const draftText = 'Morning note about tea.'; // edited "coffee" -> "tea" within the saved span
    const ancestorText = 'Morning note about coffee.';
    const result = mergeConflictingText(serverText, draftText, ancestorText);
    expect(result).toBe('Morning note about coffee.\n\nTelegram msg 1\n\nMorning note about tea.');
  });
});
