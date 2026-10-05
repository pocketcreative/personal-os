'use client';
import { useEffect, useRef, useState } from 'react';
import { compareByScore, formatScore, isOutlier, roundScore } from '@/lib/outlierScore';
import {
  DEFAULT_FILTERS, SCORE_OPTIONS, WINDOW_OPTIONS, buildQuery, filterRows, isFiltered,
  type Filters, type ScoreFilter, type Tab, type WindowFilter,
} from '@/lib/outlierFilters';

type RowStatus = 'scored' | 'too_new' | 'not_enough' | 'no_data' | 'unlisted';
interface Baseline { baseline: number | null; count: number }

interface Scored {
  outlierScore: number | null;
  baselineViews: number | null;
  baselineCount: number;
  scoreStatus: RowStatus;
}

interface YoutubeVideoRow extends Scored {
  contentItemId: string | null;
  name: string | null;
  format: 'long' | 'short' | null;
  url: string;
  videoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  views: number | null;
  averageViewPercentage: number | null;
  hasEnoughData: boolean;
  error: string | null;
}

interface InstagramPost extends Scored {
  format: string;
  id: string;
  content: string;
  publishedAt: string | null;
  platformPostUrl: string | null;
  thumbnailUrl: string | null;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
}

interface FollowerPoint { date: string; followers: number }

const panel: React.CSSProperties = {
  background: 'var(--ink-1)', border: '1px solid var(--ink-2)', borderRadius: 12,
};
const sectionTitle: React.CSSProperties = {
  font: "800 18px 'Archivo', sans-serif", letterSpacing: '-0.01em', color: 'var(--ink-4)',
};
const th: React.CSSProperties = {
  textAlign: 'left', font: "700 11px 'Inter Tight', sans-serif", color: 'var(--ink-3)',
  textTransform: 'uppercase', letterSpacing: '0.04em', padding: '8px 12px', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '10px 12px', font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-4)',
  borderTop: '1px solid var(--ink-2)', verticalAlign: 'middle',
};

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'n/a';
  return n.toLocaleString('en-US');
}
function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'n/a';
  return `${n.toFixed(1)}%`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return 'n/a';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type SortKey = 'outlier' | 'views' | 'published';
interface SortState { key: SortKey; dir: 'asc' | 'desc' }
const DEFAULT_SORT: SortState = { key: 'outlier', dir: 'desc' };

// Unscored rows (and rows with no value for the chosen column) always sit last.
function sortRows<T extends { outlierScore: number | null; publishedAt: string | null }>(
  rows: T[], sort: SortState, views: (r: T) => number | null,
): T[] {
  const sign = sort.dir === 'desc' ? 1 : -1;
  const newest = (a: T, b: T) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0);
  return [...rows].sort((a, b) => {
    if (sort.key === 'outlier') {
      if (sort.dir === 'desc' || a.outlierScore === null || b.outlierScore === null) return compareByScore(
        { score: a.outlierScore, publishedAt: a.publishedAt }, { score: b.outlierScore, publishedAt: b.publishedAt });
      return a.outlierScore - b.outlierScore || newest(a, b);
    }
    const va = sort.key === 'views' ? views(a) : (Date.parse(a.publishedAt ?? '') || null);
    const vb = sort.key === 'views' ? views(b) : (Date.parse(b.publishedAt ?? '') || null);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (vb - va) * sign || newest(a, b);
  });
}

function SortTh({ label, k, sort, setSort, className }: { label: string; k: SortKey; sort: SortState; setSort: (s: SortState) => void; className?: string }) {
  const active = sort.key === k;
  const ariaSort = active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none';
  return (
    <th style={th} aria-sort={ariaSort} className={className}>
      <button type="button" className="an-sort" onClick={() => setSort({ key: k, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}>
        {label}
        <span className="an-sort-arrow" aria-hidden="true">{active ? (sort.dir === 'desc' ? '\u25BC' : '\u25B2') : ''}</span>
      </button>
    </th>
  );
}

const STATUS_TEXT: Record<Exclude<RowStatus, 'scored'>, string> = {
  too_new: 'Too new. Scored after 7 days.',
  not_enough: 'Need 5+ videos to score.',
  unlisted: 'Unlisted. Not scored.',
  no_data: 'No view data yet.',
};

function OutlierCell({ row, noun, scoresOff }: { row: Scored & { views?: number | null; impressions?: number | null }; noun: string; scoresOff: boolean }) {
  if (scoresOff) return <span className="an-status">n/a</span>;
  if (row.scoreStatus !== 'scored' || row.outlierScore === null) {
    const text = STATUS_TEXT[row.scoreStatus as Exclude<RowStatus, 'scored'>];
    return <span className="an-status">{noun === 'posts' ? text.replace('videos', 'posts') : text}</span>;
  }
  const score = row.outlierScore;
  const hot = isOutlier(score);
  const own = row.views ?? row.impressions ?? 0;
  const tip = `${fmtNum(own)} views vs normal of ${fmtNum(Math.round(row.baselineViews ?? 0))}`;
  return (
    <span className="an-score an-tip" data-tip={tip} tabIndex={0}>
      <span className={`an-score-num${roundScore(score) < 1 ? ' low' : ''}`}>{formatScore(score)}</span>
      <span className="an-bar" aria-hidden="true">
        <span className={`an-bar-fill${hot ? ' hot' : ''}`} style={{ width: `${Math.min(score, 5) / 5 * 100}%` }} />
        <span className="an-bar-tick" />
      </span>
      {hot && <span className="an-pill">Outlier</span>}
      <span className="an-sr">{tip}</span>
    </span>
  );
}

function NormalNote({ baseline, noun, label }: { baseline: Baseline | null | undefined; noun: string; label: string }) {
  return (
    <p className="an-note">
      {baseline && baseline.baseline !== null
        ? `Normal = ${fmtNum(Math.round(baseline.baseline))} views (middle value of your last ${baseline.count} ${label}). 1.0x is a normal ${noun === 'posts' ? 'post' : 'video'}. 2x and up is an outlier.`
        : `Not enough ${noun} to set a normal yet.`}
    </p>
  );
}

const AGE_NOTE = 'Older videos have had more time to get views, so they can score higher.';

function YoutubeTable({ rows, baseline, scoresOff, sort, setSort, short }: {
  rows: YoutubeVideoRow[]; baseline: Baseline | null | undefined; scoresOff: boolean;
  sort: SortState; setSort: (s: SortState) => void; short?: boolean;
}) {
  return (
    <>
      {!scoresOff && <NormalNote baseline={baseline} noun="videos" label={short ? 'Shorts' : 'long-form videos'} />}
      <div className="an-wrap">
        <table className="an-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th} className="an-hide-m">Video</th>
              <SortTh label="Outlier" k="outlier" sort={sort} setSort={setSort} />
              <SortTh label="Published" k="published" sort={sort} setSort={setSort} />
              <SortTh label="Views" k="views" sort={sort} setSort={setSort} />
              <th style={th} className="an-hide-m">Avg % Viewed</th>
              <th style={th} className="an-hide-m">Thumbnail CTR</th>
            </tr>
          </thead>
          <tbody>
            {sortRows(rows, sort, (v) => v.views).map((v) => (
              <tr key={v.videoId}>
                <td style={td} className="an-cell-main">
                  <a href={v.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                    {v.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnailUrl} alt="" width={64} height={36} style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ maxWidth: 340 }}>
                      <div style={{ font: "700 13px 'Inter Tight', sans-serif", color: 'var(--ink-4)' }}>{v.title ?? v.name}</div>
                      {v.name && <div style={{ font: "500 11px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>{v.name}</div>}
                    </div>
                  </a>
                  {v.error && <div style={{ marginTop: 4, font: "600 11px 'Inter Tight', sans-serif", color: 'var(--danger)' }}>{v.error}</div>}
                </td>
                <td style={td} className="an-cell-score"><OutlierCell row={v} noun="videos" scoresOff={scoresOff} /></td>
                <td style={td} className="an-cell-date">{fmtDate(v.publishedAt)}</td>
                <td style={td} className="an-cell-views">{fmtNum(v.views)}<span className="an-m-only"> views</span></td>
                <td style={td} className="an-hide-m">{v.hasEnoughData ? fmtPct(v.averageViewPercentage) : 'n/a'}</td>
                <td style={td} className="an-hide-m"><span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }} title="YouTube's public Analytics API doesn't expose impressions/thumbnail CTR -- Studio-only data.">not exposed by API</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
];

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ youtube: null, instagram: null });
  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    refs.current[TABS[next].id]?.focus();
  };
  return (
    <div role="tablist" aria-label="Analytics source" className="an-tabs" onKeyDown={onKey}>
      {TABS.map((t) => (
        <button
          key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" id={`an-tab-${t.id}`}
          aria-selected={tab === t.id} aria-controls={`an-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
          className="an-tab" onClick={() => setTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FilterBar({ filters, setFilters, shown, total, noun }: {
  filters: Filters; setFilters: (f: Filters) => void; shown: number; total: number; noun: 'videos' | 'posts';
}) {
  const active = isFiltered(filters);
  return (
    <div className="an-filters">
      <div className="an-filter-row">
        <div role="group" aria-label="Filter by score" className="an-chips">
          {SCORE_OPTIONS.map((o) => (
            <button
              key={o.value} type="button" className="an-chip" aria-pressed={filters.score === o.value}
              onClick={() => setFilters({ ...filters, score: o.value as ScoreFilter })}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="an-field">
          <span className="an-field-label">Time</span>
          <select className="an-input" value={filters.window} onChange={(e) => setFilters({ ...filters, window: e.target.value as WindowFilter })}>
            {WINDOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="an-field an-field-search">
          <span className="an-field-label">Search</span>
          <input
            type="search" className="an-input" value={filters.q} placeholder={noun === 'videos' ? 'Title' : 'Caption'}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </label>
      </div>
      <p className="an-filter-meta">
        <span aria-live="polite">Showing {shown} of {total}</span>
        {active && <button type="button" className="an-link" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>}
        {filters.score !== 'all' && <span className="an-filter-hint">Rows without a score (unlisted, too new, n/a) only show under All.</span>}
      </p>
    </div>
  );
}

function EmptyFilter({ noun }: { noun: 'videos' | 'posts' }) {
  return <div className="an-empty">No {noun} match these filters</div>;
}

const ytText = (v: YoutubeVideoRow) => `${v.title ?? ''} ${v.name ?? ''}`;

export default function AnalyticsDashboard({ initialTab = 'youtube', initialFilters = DEFAULT_FILTERS }: { initialTab?: Tab; initialFilters?: Filters }) {
  const [tab, setTabState] = useState<Tab>(initialTab);
  // Filters are kept per tab. The URL carries the active tab's filters.
  const [filtersByTab, setFiltersByTab] = useState<Record<Tab, Filters>>({
    youtube: initialTab === 'youtube' ? initialFilters : DEFAULT_FILTERS,
    instagram: initialTab === 'instagram' ? initialFilters : DEFAULT_FILTERS,
  });
  const syncUrl = (t: Tab, f: Filters) => {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${buildQuery(t, f)}`);
  };
  const setTab = (t: Tab) => { setTabState(t); syncUrl(t, filtersByTab[t]); };
  const setFilters = (t: Tab) => (f: Filters) => { setFiltersByTab((prev) => ({ ...prev, [t]: f })); syncUrl(t, f); };

  const [ytVideos, setYtVideos] = useState<YoutubeVideoRow[]>([]);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytLoading, setYtLoading] = useState(true);
  const [ytBaselines, setYtBaselines] = useState<Record<string, Baseline> | null>(null);
  const [ytScoresOff, setYtScoresOff] = useState<string | null>(null);
  const [ytSort, setYtSort] = useState<SortState>(DEFAULT_SORT);
  const [igBaselines, setIgBaselines] = useState<Record<string, Baseline> | null>(null);
  const [igSort, setIgSort] = useState<SortState>(DEFAULT_SORT);

  const [igPosts, setIgPosts] = useState<InstagramPost[]>([]);
  const [igFollowers, setIgFollowers] = useState<number | null>(null);
  const [igTotalPosts, setIgTotalPosts] = useState<number | null>(null);
  const [igHistory, setIgHistory] = useState<FollowerPoint[]>([]);
  const [igError, setIgError] = useState<string | null>(null);
  const [igLoading, setIgLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics/youtube')
      .then((r) => r.json())
      .then((d) => {
        setYtVideos(d.videos ?? []);
        setYtError(d.error ?? null);
        setYtBaselines(d.baselines ?? null);
        setYtScoresOff(d.scoresOffReason ?? null);
      })
      .catch((e) => setYtError(String(e)))
      .finally(() => setYtLoading(false));

    fetch('/api/analytics/instagram')
      .then((r) => r.json())
      .then((d) => {
        setIgPosts(d.posts ?? []);
        setIgFollowers(d.followersCount ?? null);
        setIgTotalPosts(d.totalPosts ?? null);
        setIgHistory(d.followerHistory ?? []);
        setIgBaselines(d.baselines ?? null);
        setIgError(d.error ?? null);
      })
      .catch((e) => setIgError(String(e)))
      .finally(() => setIgLoading(false));
  }, []);

  const followerDelta = igHistory.length >= 2 ? igHistory[igHistory.length - 1].followers - igHistory[0].followers : null;

  // Filters only choose which rows show. Scores and the Normal note come from the full set.
  const ytF = filtersByTab.youtube;
  const igF = filtersByTab.instagram;
  const ytLong = ytVideos.filter((v) => v.format !== 'short');
  const ytShort = ytVideos.filter((v) => v.format === 'short');
  const ytLongShown = filterRows(ytLong, ytF, ytText);
  const ytShortShown = filterRows(ytShort, ytF, ytText);
  const igShown = filterRows(igPosts, igF, (p) => p.content);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ font: "800 28px 'Archivo', sans-serif", letterSpacing: '-0.01em', color: 'var(--ink-4)' }}>Analytics</h1>
        <p style={{ marginTop: 4, font: "500 14px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>
          Real YouTube long-form stats and real Instagram (@brendanangg) stats, pulled live.
        </p>
      </div>

      <Tabs tab={tab} setTab={setTab} />

      {/* YouTube */}
      <section role="tabpanel" id="an-panel-youtube" aria-labelledby="an-tab-youtube" hidden={tab !== 'youtube'} style={{ ...panel, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={sectionTitle}>YouTube long form</h2>
          {ytLoading && <span style={{ font: "600 12px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>Loading…</span>}
        </div>
        {ytError && (
          <div style={{ background: 'rgba(179,38,30,.08)', border: '1px solid rgba(179,38,30,.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, font: "600 12.5px 'Inter Tight', sans-serif", color: 'var(--danger)' }}>
            {ytError}
          </div>
        )}
        {ytScoresOff && (
          <div style={{ background: 'rgba(179,38,30,.08)', border: '1px solid rgba(179,38,30,.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, font: "600 12.5px 'Inter Tight', sans-serif", color: 'var(--danger)' }}>
            {ytScoresOff}
          </div>
        )}
        {!ytLoading && !ytError && ytVideos.length === 0 && (
          <p style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>No videos yet.</p>
        )}
        {ytVideos.length > 0 && (
          <FilterBar filters={ytF} setFilters={setFilters('youtube')} shown={ytLongShown.length + ytShortShown.length} total={ytVideos.length} noun="videos" />
        )}
        {ytVideos.length > 0 && (ytLongShown.length + ytShortShown.length === 0 ? (
          <EmptyFilter noun="videos" />
        ) : (
          <>
            {ytLongShown.length > 0 && (
              <YoutubeTable rows={ytLongShown} baseline={ytBaselines?.long} scoresOff={!!ytScoresOff} sort={ytSort} setSort={setYtSort} />
            )}
            {ytShortShown.length > 0 && (
              <>
                <h2 style={{ ...sectionTitle, margin: '24px 0 14px' }}>YouTube Shorts</h2>
                <YoutubeTable rows={ytShortShown} baseline={ytBaselines?.short} scoresOff={!!ytScoresOff} sort={ytSort} setSort={setYtSort} short />
              </>
            )}
          </>
        ))}
        <p style={{ marginTop: 12, font: "500 11.5px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>
          {AGE_NOTE}{' '}Thumbnail CTR isn&apos;t shown because YouTube&apos;s public Analytics API doesn&apos;t expose impressions or click-through rate for any account, that data only exists in YouTube Studio&apos;s own UI. Views come from the YouTube Data API. Average % viewed is only pulled for your LF videos.
        </p>
      </section>

      {/* Instagram */}
      <section role="tabpanel" id="an-panel-instagram" aria-labelledby="an-tab-instagram" hidden={tab !== 'instagram'} style={{ ...panel, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={sectionTitle}>Instagram — @brendanangg</h2>
          {igLoading && <span style={{ font: "600 12px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>Loading…</span>}
        </div>
        {igError && (
          <div style={{ background: 'rgba(179,38,30,.08)', border: '1px solid rgba(179,38,30,.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, font: "600 12.5px 'Inter Tight', sans-serif", color: 'var(--danger)' }}>
            {igError}
          </div>
        )}
        {!igLoading && !igError && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div style={{ font: "800 26px 'Archivo', sans-serif", color: 'var(--ink-4)' }}>{fmtNum(igFollowers)}</div>
              <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Followers {followerDelta !== null && <span style={{ color: followerDelta >= 0 ? 'var(--ok)' : 'var(--danger)' }}>({followerDelta >= 0 ? '+' : ''}{followerDelta} / 30d)</span>}
              </div>
            </div>
            <div>
              <div style={{ font: "800 26px 'Archivo', sans-serif", color: 'var(--ink-4)' }}>{fmtNum(igTotalPosts)}</div>
              <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Posts in the last 12 months</div>
              {igTotalPosts !== null && igTotalPosts > igPosts.length && igPosts.length > 0 && (
                <div style={{ marginTop: 2, font: "500 11px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>The table lists the latest {igPosts.length}.</div>
              )}
            </div>
          </div>
        )}
        {!igLoading && !igError && igPosts.length === 0 && (
          <p style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>No posts yet.</p>
        )}
        {igPosts.length > 0 && (
          <FilterBar filters={igF} setFilters={setFilters('instagram')} shown={igShown.length} total={igPosts.length} noun="posts" />
        )}
        {igPosts.length > 0 && igShown.length === 0 && (
          <EmptyFilter noun="posts" />
        )}
        {igPosts.length > 0 && <NormalNote baseline={igBaselines?.REELS} noun="posts" label="Reels" />}
        {igShown.length > 0 && (
          <>
            <div className="an-wrap">
              <table className="an-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th} className="an-hide-m">Post</th>
                    <SortTh label="Outlier" k="outlier" sort={igSort} setSort={setIgSort} />
                    <SortTh label="Published" k="published" sort={igSort} setSort={setIgSort} />
                    <SortTh label="Impressions" k="views" sort={igSort} setSort={setIgSort} />
                    <th style={th} className="an-hide-m">Reach</th>
                    <th style={th} className="an-hide-m">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {sortRows(igShown, igSort, (p) => p.impressions).map((p) => (
                    <tr key={p.id}>
                      <td style={td} className="an-cell-main">
                        <a href={p.platformPostUrl ?? '#'} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                          {p.thumbnailUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.thumbnailUrl} alt="" width={36} height={36} style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                          )}
                          <div style={{ maxWidth: 380, font: "500 12.5px 'Inter Tight', sans-serif", color: 'var(--ink-4)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {p.content || <em style={{ color: 'var(--ink-3)' }}>(no caption)</em>}
                          </div>
                        </a>
                      </td>
                      <td style={td} className="an-cell-score"><OutlierCell row={p} noun="posts" scoresOff={false} /></td>
                      <td style={td} className="an-cell-date">{fmtDate(p.publishedAt)}</td>
                      <td style={td} className="an-cell-views">{fmtNum(p.impressions)}<span className="an-m-only"> impressions</span></td>
                      <td style={td} className="an-hide-m">{fmtNum(p.reach)}</td>
                      <td style={td} className="an-hide-m">
                        {fmtPct(p.engagementRate)}
                        <span style={{ marginLeft: 8, font: "500 11px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>
                          {p.likes}❤ {p.comments}💬 {p.shares}↗ {p.saves}🔖
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
