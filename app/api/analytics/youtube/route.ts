import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import {
  extractVideoId, fetchVideoMeta, fetchVideoAnalytics, fetchChannelUploads, classifyFormats,
  type ChannelUpload,
} from '@/lib/youtubeAnalytics';
import { computeOutlierScores, groupBaseline, type ScoreInput, type ScoreStatus } from '@/lib/outlierScore';

export const dynamic = 'force-dynamic';

type RowStatus = ScoreStatus | 'unlisted';

interface YoutubeVideoRow {
  contentItemId: string | null; // null for channel videos that are not LF rows
  name: string | null;
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
  format: 'long' | 'short' | null;
  outlierScore: number | null;
  baselineViews: number | null;
  baselineCount: number;
  scoreStatus: RowStatus;
}

const noScore = { format: null, outlierScore: null, baselineViews: null, baselineCount: 0 } as const;
const headers = { 'cache-control': 'no-store' };

// The channel list changes slowly and costs about 7 YouTube quota units plus 2
// Analytics calls, so each warm server instance keeps it for 5 minutes. The
// response itself stays no-store.
const CHANNEL_TTL_MS = 5 * 60 * 1000;
let channelCache: { at: number; uploads: ChannelUpload[]; formats: Record<string, 'short' | 'long'> } | null = null;

async function loadChannel() {
  if (channelCache && Date.now() - channelCache.at < CHANNEL_TTL_MS) return channelCache;
  const uploads = await fetchChannelUploads();
  const formats = await classifyFormats(uploads.filter((u) => u.privacyStatus === 'public').map((u) => u.id));
  channelCache = { at: Date.now(), uploads, formats };
  return channelCache;
}

// Rows = public channel videos + the Supabase LF rows, deduped by videoId.
// LF rows come from content_items where type='lf' and posted_footage holds a
// real YouTube URL (not hardcoded, so a newly-published LF shows up automatically).
// Unlisted LF rows are shown as "Unlisted. Not scored."; other unlisted and all
// private uploads are never returned.
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

  const lf = (items ?? [])
    .map((item) => ({ item, videoId: extractVideoId(item.posted_footage as string) }))
    .filter((c): c is { item: typeof items[number]; videoId: string } => !!c.videoId);
  const lfById = new Map(lf.map((c) => [c.videoId, c.item]));

  let channel: Awaited<ReturnType<typeof loadChannel>>;
  try {
    channel = await loadChannel();
  } catch (e) {
    const why = `Couldn't load the full channel, so scores are off for now. (${(e as Error).message.slice(0, 160)})`;
    return legacyRows(lf, why);
  }
  const { uploads, formats } = channel;

  const kept = uploads.filter((u) => u.privacyStatus === 'public' || (u.privacyStatus === 'unlisted' && lfById.has(u.id)));
  const scoreInputs: ScoreInput[] = kept
    .filter((u) => u.privacyStatus === 'public')
    .map((u) => ({ id: u.id, publishedAt: u.publishedAt, views: u.views, format: formats[u.id] }));
  const scores = computeOutlierScores(scoreInputs);
  const baselines = { long: groupBaseline(scoreInputs, 'long'), short: groupBaseline(scoreInputs, 'short') };

  const videos: YoutubeVideoRow[] = await Promise.all(kept.map(async (u) => {
    const item = lfById.get(u.id);
    const s = scores[u.id]; // undefined for unlisted rows
    const row: YoutubeVideoRow = {
      contentItemId: item ? (item.id as string) : null,
      name: item ? (item.name as string) : null,
      url: item ? (item.posted_footage as string) : `https://www.youtube.com/watch?v=${u.id}`,
      videoId: u.id,
      title: u.title,
      thumbnailUrl: u.thumbnailUrl,
      publishedAt: u.publishedAt,
      views: u.views,
      averageViewPercentage: null,
      impressions: null,
      impressionClickThroughRate: null,
      hasEnoughData: true,
      error: null,
      format: s ? formats[u.id] : null,
      outlierScore: s ? s.score : null,
      baselineViews: s ? s.baseline : null,
      baselineCount: s ? s.baselineCount : 0,
      scoreStatus: s ? s.status : 'unlisted',
    };
    if (item) {
      // Avg % viewed stays an Analytics API call, LF rows only (as before).
      try {
        const a = await fetchVideoAnalytics(u.id, u.publishedAt);
        row.averageViewPercentage = a.averageViewPercentage;
        row.hasEnoughData = a.hasEnoughData;
      } catch (e) {
        row.error = (e as Error).message;
        row.hasEnoughData = false;
      }
    }
    return row;
  }));

  // An LF row whose video is missing from the uploads list (private is still in
  // the list, so this means deleted or not on this channel): flagged row, no scores.
  const inUploads = new Set(uploads.map((u) => u.id));
  for (const { item, videoId } of lf) {
    if (inUploads.has(videoId)) continue;
    videos.push({
      contentItemId: item.id as string, name: item.name as string, url: item.posted_footage as string, videoId,
      title: null, thumbnailUrl: null, publishedAt: null, views: null, averageViewPercentage: null,
      impressions: null, impressionClickThroughRate: null, hasEnoughData: false,
      error: 'Video not found via YouTube Data API (private, deleted, or wrong ID?)', ...noScore, scoreStatus: 'no_data',
    });
  }

  return NextResponse.json({ videos, baselines, error: null, scoresOffReason: null }, { headers });
}

// Fallback when the channel-wide fetch fails: the old LF-only rows, no scores.
async function legacyRows(
  lf: { item: { id: unknown; name: unknown; posted_footage: unknown }; videoId: string }[],
  scoresOffReason: string,
) {
  if (lf.length === 0) return NextResponse.json({ videos: [], baselines: null, error: null, scoresOffReason }, { headers });
  let meta: Awaited<ReturnType<typeof fetchVideoMeta>>;
  try {
    meta = await fetchVideoMeta(lf.map((c) => c.videoId));
  } catch (e) {
    return NextResponse.json({ videos: [], baselines: null, error: (e as Error).message, scoresOffReason }, { status: 200, headers });
  }
  const videos: YoutubeVideoRow[] = await Promise.all(lf.map(async ({ item, videoId }) => {
    const m = meta[videoId];
    const base: YoutubeVideoRow = {
      contentItemId: item.id as string, name: item.name as string, url: item.posted_footage as string, videoId,
      title: m?.title ?? null, thumbnailUrl: m?.thumbnailUrl ?? null, publishedAt: m?.publishedAt ?? null,
      views: null, averageViewPercentage: null, impressions: null, impressionClickThroughRate: null,
      hasEnoughData: true, error: null, ...noScore, scoreStatus: 'no_data',
    };
    if (!m) return { ...base, error: 'Video not found via YouTube Data API (private, deleted, or wrong ID?)' };
    try {
      const analytics = await fetchVideoAnalytics(videoId, m.publishedAt);
      return { ...base, ...analytics };
    } catch (e) {
      return { ...base, error: (e as Error).message, hasEnoughData: false };
    }
  }));
  return NextResponse.json({ videos, baselines: null, error: null, scoresOffReason }, { headers });
}
