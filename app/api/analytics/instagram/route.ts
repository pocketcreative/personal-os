import { NextResponse } from 'next/server';
import { getInstagramAnalytics, getInstagramFollowerHistory } from '@/lib/zernio';
import { computeOutlierScores, groupBaseline, type ScoreInput } from '@/lib/outlierScore';

export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;

// Real Zernio REST calls (GET /v1/analytics, GET /v1/accounts/follower-stats)
// for the connected @brendanangg Instagram account -- see lib/zernio.ts.
// Up to 50 posts from the last 365 days (Zernio only returns 90 days unless
// fromDate is passed). Each post is scored on impressions against its own
// format (REELS vs FEED); a missing impressions number stays null, never 0.
export async function GET() {
  try {
    const [analytics, history] = await Promise.all([
      getInstagramAnalytics(50, new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10)),
      getInstagramFollowerHistory(new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10)),
    ]);
    const inputs: ScoreInput[] = analytics.posts.map((p) => ({
      id: p.id, publishedAt: p.publishedAt, views: p.impressionsRaw, format: p.mediaProductType ?? 'OTHER',
    }));
    const scores = computeOutlierScores(inputs);
    const posts = analytics.posts.map((p) => {
      const s = scores[p.id];
      return {
        ...p,
        format: p.mediaProductType ?? 'OTHER',
        outlierScore: s.score, baselineViews: s.baseline, baselineCount: s.baselineCount, scoreStatus: s.status,
      };
    });
    const formats = [...new Set(inputs.map((i) => i.format))];
    const baselines = Object.fromEntries(formats.map((f) => [f, groupBaseline(inputs, f)]));
    return NextResponse.json({ ...analytics, posts, baselines, followerHistory: history, error: null }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { followersCount: null, totalPosts: null, posts: [], baselines: null, followerHistory: [], error: (e as Error).message },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
}
