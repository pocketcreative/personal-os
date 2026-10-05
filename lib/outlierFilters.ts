// Row filters for the /analytics tables. Filters only decide which rows show.
// Scores and the "Normal" baseline are always computed on the full set elsewhere.
import { roundScore } from '@/lib/outlierScore';

export type ScoreFilter = 'all' | '2x' | '1x' | 'below1';
export type WindowFilter = 'all' | '30d' | '90d' | '12m';
export type Tab = 'youtube' | 'instagram';

export interface Filters { score: ScoreFilter; window: WindowFilter; q: string }

export const DEFAULT_FILTERS: Filters = { score: 'all', window: 'all', q: '' };

export const SCORE_OPTIONS: { value: ScoreFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '2x', label: '2x and up' },
  { value: '1x', label: '1x and up' },
  { value: 'below1', label: 'Below 1x' },
];
export const WINDOW_OPTIONS: { value: WindowFilter; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
];

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS: Record<Exclude<WindowFilter, 'all'>, number> = { '30d': 30, '90d': 90, '12m': 365 };

export function isFiltered(f: Filters): boolean {
  return f.score !== 'all' || f.window !== 'all' || f.q.trim() !== '';
}

interface Filterable { outlierScore: number | null; publishedAt: string | null }

// Score thresholds use the rounded value, same as the pill (1.96 reads 2.0x, so it counts as 2x).
// Rows with no score only show under "All".
function passesScore(score: number | null, f: ScoreFilter): boolean {
  if (f === 'all') return true;
  if (score === null) return false;
  const r = roundScore(score);
  if (f === '2x') return r >= 2;
  if (f === '1x') return r >= 1;
  return r < 1;
}

// Window is inclusive at the cutoff. A row with no valid date does not pass a window.
function passesWindow(publishedAt: string | null, f: WindowFilter, now: number): boolean {
  if (f === 'all') return true;
  const t = publishedAt ? Date.parse(publishedAt) : NaN;
  if (Number.isNaN(t)) return false;
  return t >= now - WINDOW_DAYS[f] * DAY;
}

export function filterRows<T extends Filterable>(rows: T[], f: Filters, text: (r: T) => string, now: number = Date.now()): T[] {
  const needle = f.q.trim().toLowerCase();
  return rows.filter((r) =>
    passesScore(r.outlierScore, f.score) &&
    passesWindow(r.publishedAt, f.window, now) &&
    (needle === '' || text(r).toLowerCase().includes(needle)));
}

// URL helpers. Unknown or missing values fall back to the default.
export function parseTab(v: string | null | undefined): Tab {
  return v === 'instagram' ? 'instagram' : 'youtube';
}
export function parseFilters(raw: { score?: string | null; window?: string | null; q?: string | null }): Filters {
  const score = SCORE_OPTIONS.find((o) => o.value === raw.score)?.value ?? 'all';
  const window = WINDOW_OPTIONS.find((o) => o.value === raw.window)?.value ?? 'all';
  return { score, window, q: raw.q ?? '' };
}
// Query string for the active tab only ("" when everything is default).
export function buildQuery(tab: Tab, f: Filters): string {
  const p = new URLSearchParams();
  if (tab !== 'youtube') p.set('tab', tab);
  if (f.score !== 'all') p.set('score', f.score);
  if (f.window !== 'all') p.set('window', f.window);
  if (f.q.trim() !== '') p.set('q', f.q);
  const s = p.toString();
  return s ? `?${s}` : '';
}
