import { NextResponse } from 'next/server';
import { getInstagramAnalytics, getInstagramFollowerHistory } from '@/lib/zernio';

export const dynamic = 'force-dynamic';

// Real Zernio REST calls (GET /v1/analytics, GET /v1/accounts/follower-stats)
// for the connected @brendanangg Instagram account -- see lib/zernio.ts.
export async function GET() {
  try {
    const [analytics, history] = await Promise.all([
      getInstagramAnalytics(20),
      getInstagramFollowerHistory(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
    ]);
    return NextResponse.json({ ...analytics, followerHistory: history, error: null }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { followersCount: null, totalPosts: null, posts: [], followerHistory: [], error: (e as Error).message },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
}
