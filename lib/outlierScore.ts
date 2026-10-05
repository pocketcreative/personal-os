// Outlier score = a post's views divided by the middle value (median) of the
// views of up to 20 comparable posts. Pure functions, no API calls in here.
//
// Rules (see 01. Inbox/agent-drops/outlier-score-plan-2026-10-05.md and its audit):
// - Each format is scored only against itself (YouTube long/short, Instagram REELS/FEED).
// - Posts younger than 7 days get no score and are not used in anyone's baseline.
// - Baseline for a post = median views of the 20 most recent eligible posts in
//   its format, not counting the post itself.
// - Fewer than 5 posts in that baseline, or a baseline of 0: no score.
// - Lifetime views, so older posts have had more time to collect views.

export const MIN_AGE_DAYS = 7;
export const BASELINE_SIZE = 20;
export const MIN_BASELINE = 5;
export const OUTLIER_AT = 2;

export type ScoreStatus = 'scored' | 'too_new' | 'not_enough' | 'no_data';

export interface ScoreInput {
  id: string;
  publishedAt: string | null;
  views: number | null;
  format: string;
}

export interface ScoreResult {
  id: string;
  score: number | null;
  baseline: number | null; // median used for this post (can be a .5 value)
  baselineCount: number;
  status: ScoreStatus;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface Eligible { id: string; time: number; views: number }

function eligiblePool(items: ScoreInput[], format: string, now: number): Eligible[] {
  const cutoff = now - MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
  const out: Eligible[] = [];
  for (const it of items) {
    if (it.format !== format || it.views === null || !it.publishedAt) continue;
    const time = Date.parse(it.publishedAt);
    if (Number.isNaN(time) || time > cutoff) continue;
    out.push({ id: it.id, time, views: it.views });
  }
  // newest first; ties on time fall back to id so the order is stable
  return out.sort((a, b) => b.time - a.time || a.id.localeCompare(b.id));
}

function baselineFor(pool: Eligible[], excludeId: string | null) {
  const picked = pool.filter((p) => p.id !== excludeId).slice(0, BASELINE_SIZE);
  return { count: picked.length, median: picked.length ? median(picked.map((p) => p.views)) : null };
}

// One result per input item, keyed by id.
export function computeOutlierScores(items: ScoreInput[], now: number = Date.now()): Record<string, ScoreResult> {
  const pools = new Map<string, Eligible[]>();
  const out: Record<string, ScoreResult> = {};
  for (const it of items) {
    if (!pools.has(it.format)) pools.set(it.format, eligiblePool(items, it.format, now));
    const empty = { id: it.id, score: null, baseline: null, baselineCount: 0 };
    const time = it.publishedAt ? Date.parse(it.publishedAt) : NaN;
    if (it.views === null || Number.isNaN(time)) { out[it.id] = { ...empty, status: 'no_data' }; continue; }
    if (time > now - MIN_AGE_DAYS * 24 * 60 * 60 * 1000) { out[it.id] = { ...empty, status: 'too_new' }; continue; }
    const { count, median: m } = baselineFor(pools.get(it.format)!, it.id);
    if (count < MIN_BASELINE || m === null || m <= 0) {
      out[it.id] = { ...empty, baseline: m, baselineCount: count, status: 'not_enough' };
      continue;
    }
    out[it.id] = { id: it.id, score: it.views / m, baseline: m, baselineCount: count, status: 'scored' };
  }
  return out;
}

// The "Normal = N views" note above a table: median of the 20 most recent
// eligible posts in the format, nobody excluded.
export function groupBaseline(items: ScoreInput[], format: string, now: number = Date.now()): { baseline: number | null; count: number } {
  const { count, median: m } = baselineFor(eligiblePool(items, format, now), null);
  if (count < MIN_BASELINE || m === null || m <= 0) return { baseline: null, count };
  return { baseline: m, count };
}

// Display helpers. The pill decision uses the ROUNDED value so a row never
// reads "2.0x" without the pill. Sorting uses the raw score.
export const roundScore = (s: number) => Math.round(s * 10) / 10;
export const formatScore = (s: number) => `${roundScore(s).toFixed(1)}x`;
export const isOutlier = (s: number) => roundScore(s) >= OUTLIER_AT;

// Sort helper: higher score first, unscored rows last, ties newest first.
export function compareByScore(
  a: { score: number | null; publishedAt: string | null },
  b: { score: number | null; publishedAt: string | null },
): number {
  if (a.score === null && b.score === null) return (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0);
  if (a.score === null) return 1;
  if (b.score === null) return -1;
  if (b.score !== a.score) return b.score - a.score;
  return (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0);
}
