/**
 * Combines a newer server-side addition (e.g. a Telegram append that landed
 * while a native edit was in progress) with the user's own in-progress
 * draft, when a save's expected-previous-text no longer matches. Never
 * discards either side -- this is the actual data-loss guarantee behind
 * autosave's automatic merge-and-retry, not just a formatting nicety.
 */
export function mergeConflictingText(serverText: string, draftText: string): string {
  if (!serverText) return draftText;
  if (!draftText) return serverText;
  return `${serverText}\n\n${draftText}`;
}
