'use client';
import { useEffect, useState } from 'react';

interface YoutubeVideoRow {
  contentItemId: string;
  name: string;
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

interface InstagramPost {
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
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}
function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AnalyticsDashboard() {
  const [ytVideos, setYtVideos] = useState<YoutubeVideoRow[]>([]);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytLoading, setYtLoading] = useState(true);

  const [igPosts, setIgPosts] = useState<InstagramPost[]>([]);
  const [igFollowers, setIgFollowers] = useState<number | null>(null);
  const [igTotalPosts, setIgTotalPosts] = useState<number | null>(null);
  const [igHistory, setIgHistory] = useState<FollowerPoint[]>([]);
  const [igError, setIgError] = useState<string | null>(null);
  const [igLoading, setIgLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics/youtube')
      .then((r) => r.json())
      .then((d) => { setYtVideos(d.videos ?? []); setYtError(d.error ?? null); })
      .catch((e) => setYtError(String(e)))
      .finally(() => setYtLoading(false));

    fetch('/api/analytics/instagram')
      .then((r) => r.json())
      .then((d) => {
        setIgPosts(d.posts ?? []);
        setIgFollowers(d.followersCount ?? null);
        setIgTotalPosts(d.totalPosts ?? null);
        setIgHistory(d.followerHistory ?? []);
        setIgError(d.error ?? null);
      })
      .catch((e) => setIgError(String(e)))
      .finally(() => setIgLoading(false));
  }, []);

  const followerDelta = igHistory.length >= 2 ? igHistory[igHistory.length - 1].followers - igHistory[0].followers : null;

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px 64px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1 style={{ font: "800 28px 'Archivo', sans-serif", letterSpacing: '-0.01em', color: 'var(--ink-4)' }}>Analytics</h1>
        <p style={{ marginTop: 4, font: "500 14px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>
          Real YouTube long-form stats and real Instagram (@brendanangg) stats, pulled live.
        </p>
      </div>

      {/* YouTube */}
      <section style={{ ...panel, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={sectionTitle}>YouTube — Long Form</h2>
          {ytLoading && <span style={{ font: "600 12px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>Loading…</span>}
        </div>
        {ytError && (
          <div style={{ background: 'rgba(179,38,30,.08)', border: '1px solid rgba(179,38,30,.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, font: "600 12.5px 'Inter Tight', sans-serif", color: 'var(--danger)' }}>
            {ytError}
          </div>
        )}
        {!ytLoading && !ytError && ytVideos.length === 0 && (
          <p style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>No published LF videos found yet.</p>
        )}
        {ytVideos.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Video</th>
                  <th style={th}>Published</th>
                  <th style={th}>Views</th>
                  <th style={th}>Avg % Viewed</th>
                  <th style={th}>Thumbnail CTR</th>
                </tr>
              </thead>
              <tbody>
                {ytVideos.map((v) => (
                  <tr key={v.videoId}>
                    <td style={td}>
                      <a href={v.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                        {v.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumbnailUrl} alt="" width={64} height={36} style={{ borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <div style={{ maxWidth: 340 }}>
                          <div style={{ font: "700 13px 'Inter Tight', sans-serif", color: 'var(--ink-4)' }}>{v.title ?? v.name}</div>
                          <div style={{ font: "500 11px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>{v.name}</div>
                        </div>
                      </a>
                      {v.error && <div style={{ marginTop: 4, font: "600 11px 'Inter Tight', sans-serif", color: 'var(--danger)' }}>{v.error}</div>}
                    </td>
                    <td style={td}>{fmtDate(v.publishedAt)}</td>
                    <td style={td}>{v.hasEnoughData ? fmtNum(v.views) : <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>not enough data yet</span>}</td>
                    <td style={td}>{v.hasEnoughData ? fmtPct(v.averageViewPercentage) : '—'}</td>
                    <td style={td}><span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }} title="YouTube's public Analytics API doesn't expose impressions/thumbnail CTR -- Studio-only data.">not exposed by API</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: 12, font: "500 11.5px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>
          Thumbnail CTR isn&apos;t shown because YouTube&apos;s public Analytics API doesn&apos;t expose impressions or click-through rate for any account, that data only exists in YouTube Studio&apos;s own UI. Real views and average % viewed are pulled live from the YouTube Analytics API.
        </p>
      </section>

      {/* Instagram */}
      <section style={{ ...panel, padding: 20 }}>
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
              <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Posts</div>
            </div>
          </div>
        )}
        {igPosts.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Post</th>
                  <th style={th}>Published</th>
                  <th style={th}>Impressions</th>
                  <th style={th}>Reach</th>
                  <th style={th}>Engagement</th>
                </tr>
              </thead>
              <tbody>
                {igPosts.map((p) => (
                  <tr key={p.id}>
                    <td style={td}>
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
                    <td style={td}>{fmtDate(p.publishedAt)}</td>
                    <td style={td}>{fmtNum(p.impressions)}</td>
                    <td style={td}>{fmtNum(p.reach)}</td>
                    <td style={td}>
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
        )}
      </section>
    </div>
  );
}
