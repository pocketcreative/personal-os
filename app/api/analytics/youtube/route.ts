import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { extractVideoId, fetchVideoMeta, fetchVideoAnalytics } from '@/lib/youtubeAnalytics';

export const dynamic = 'force-dynamic';

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
  impressions: number | null;
  impressionClickThroughRate: number | null;
  hasEnoughData: boolean;
  error: string | null;
}

// Real published LF videos = content_items where type='lf' and
// posted_footage holds a real YouTube URL. Cross-referenced against
// Supabase, not hardcoded, so a newly-published LF shows up automatically.
export async function GET() {
  const db = serviceClient();
  const { data: items, error: dbError } = await db
    .from('content_items')
    .select('id,name,posted_footage')
    .eq('user_id', USER_ID)
    .eq('type', 'lf')
    .not('posted_footage', 'is', null)
    .order('name');

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const candidates = (items ?? [])
    .map((item) => ({ item, videoId: extractVideoId(item.posted_footage as string) }))
    .filter((c): c is { item: typeof items[number]; videoId: string } => !!c.videoId);

  if (candidates.length === 0) {
    return NextResponse.json({ videos: [], error: null }, { headers: { 'cache-control': 'no-store' } });
  }

  let meta: Awaited<ReturnType<typeof fetchVideoMeta>>;
  try {
    meta = await fetchVideoMeta(candidates.map((c) => c.videoId));
  } catch (e) {
    // Credentials missing/broken, or Data API failed -- report clearly,
    // don't pretend there's data.
    return NextResponse.json({ videos: [], error: (e as Error).message }, { status: 200, headers: { 'cache-control': 'no-store' } });
  }

  const videos: YoutubeVideoRow[] = await Promise.all(candidates.map(async ({ item, videoId }) => {
    const m = meta[videoId];
    const base: YoutubeVideoRow = {
      contentItemId: item.id as string,
      name: item.name as string,
      url: item.posted_footage as string,
      videoId,
      title: m?.title ?? null,
      thumbnailUrl: m?.thumbnailUrl ?? null,
      publishedAt: m?.publishedAt ?? null,
      views: null,
      averageViewPercentage: null,
      impressions: null,
      impressionClickThroughRate: null,
      hasEnoughData: true,
      error: null,
    };
    if (!m) {
      // Data API didn't return this video (e.g. private/deleted since posting) --
      // still show the row with whatever we know from Supabase, flagged.
      return { ...base, error: 'Video not found via YouTube Data API (private, deleted, or wrong ID?)' };
    }
    try {
      const analytics = await fetchVideoAnalytics(videoId, m.publishedAt);
      return { ...base, ...analytics };
    } catch (e) {
      return { ...base, error: (e as Error).message, hasEnoughData: false };
    }
  }));

  return NextResponse.json({ videos, error: null }, { headers: { 'cache-control': 'no-store' } });
}
