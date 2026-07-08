export interface RankableTask {
  id: string;
  priority_score: number;
  rank_pinned: boolean;
}

/**
 * Merge an AI-proposed ordering into scores. Pinned tasks keep their score
 * (a manual drag beats the AI); unpinned tasks get 1000, 990, 980… in AI order.
 * Hallucinated ids are dropped; unpinned tasks missing from the AI order go last.
 */
export function mergeRanks(
  tasks: RankableTask[], aiOrderedIds: string[],
): { id: string; priority_score: number }[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Dedupe: a repeated id from the AI would otherwise appear twice in the
  // output, shifting every later task's rank down by one slot it didn't earn.
  const fromAi = [...new Set(aiOrderedIds)].filter((id) => byId.get(id) && !byId.get(id)!.rank_pinned);
  const seen = new Set(fromAi);
  const forgotten = tasks.filter((t) => !t.rank_pinned && !seen.has(t.id)).map((t) => t.id);
  return [...fromAi, ...forgotten].map((id, i) => ({ id, priority_score: 1000 - i * 10 }));
}
