/**
 * Combines a newer server-side addition (e.g. a Telegram append that landed
 * while a native edit was in progress) with the user's own in-progress
 * draft, when a save's expected-previous-text no longer matches. Never
 * discards either side -- this is the actual data-loss guarantee behind
 * autosave's automatic merge-and-retry, not just a formatting nicety.
 *
 * `ancestorText` is the shared baseline both sides grew from (the save's
 * expected-previous-text). Real conflicts always have serverText and
 * draftText descending from the same prior save, so naively concatenating
 * them would duplicate that shared prefix -- this strips it from the draft
 * first, so only the user's genuinely new addition gets appended.
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
