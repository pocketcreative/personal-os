/**
 * Combines a newer server-side addition (e.g. a Telegram append that landed
 * while a native edit was in progress) with the user's own in-progress
 * draft, when a save's expected-previous-text no longer matches. Never
 * discards either side's content -- this is the actual data-loss guarantee
 * behind autosave's automatic merge-and-retry, not just a formatting
 * nicety. Duplicated text is an acceptable outcome; losing text is not.
 *
 * `ancestorText` is the shared baseline both sides grew from (the save's
 * expected-previous-text). This recognizes only the pure-append case: when
 * `draftText` literally *starts with* `ancestorText` as a string prefix --
 * not merely "shares history with it" -- that prefix is stripped from the
 * draft before joining, so only the user's genuinely new addition gets
 * appended instead of the whole draft.
 *
 * KNOWN, DELIBERATE LIMITATION: if the user edits text WITHIN the
 * previously-saved span during the conflict window, rather than only
 * typing more after it, `draftText` no longer has `ancestorText` as a
 * literal prefix. The stripping heuristic can't apply, and this falls back
 * to concatenating both sides in full -- duplicating the overlapping text,
 * but never losing any of it. A real three-way/diff-based merge would
 * resolve this precisely, but is intentionally not built: this is a
 * personal single-user journaling app with an already-narrow autosave
 * conflict window (see
 * docs/superpowers/specs/2026-07-18-habits-reflections-enhancements-design.md,
 * section 5), and mid-span edits within that window are a narrower case
 * still. A diff algorithm would be disproportionate to that residual risk
 * -- visible, user-cleanable duplication is the accepted tradeoff.
 */
export function mergeConflictingText(serverText: string, draftText: string, ancestorText: string): string {
  const serverTrimmed = serverText.trim();
  const draftTrimmed = draftText.trim();

  // Same content on both sides (e.g. a no-op retry) -- never duplicate it.
  if (serverTrimmed === draftTrimmed) return serverTrimmed ? serverText : '';

  const draftAddition = draftText.startsWith(ancestorText)
    ? draftText.slice(ancestorText.length)
    : draftText;
  const draftAdditionTrimmed = draftAddition.trim();

  if (!serverTrimmed) return draftAdditionTrimmed || draftTrimmed;
  if (!draftAdditionTrimmed) return serverText;
  return `${serverText}\n\n${draftAdditionTrimmed}`;
}
