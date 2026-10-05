import { readFileSync } from 'node:fs';
import path from 'node:path';

// Real YouTube Data API v3 + YouTube Analytics API v2 client, server-only.
//
// Credentials come from the same OAuth "installed app" flow already run via
// scripts/youtube-analytics-auth.mjs (see that file for how the refresh
// token was obtained). Two sources, tried in this order:
//   1. Env vars (YOUTUBE_OAUTH_CLIENT_ID / _CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN)
//      -- what production (Vercel) uses, since the gitignored local files
//      below don't ship with the deploy.
//   2. The local gitignored files (.google-youtube-analytics-client-secret.json,
//      .google-youtube-analytics-tokens.json) -- dev convenience, no env
//      vars needed on this machine.
//
// Scopes actually granted (confirmed by reading the saved token file, not
// assumed): yt-analytics.readonly + youtube.readonly. That covers views,
// averageViewPercentage, and the impressions/impressionClickThroughRate
// ("thumbnail CTR") report, which YouTube Analytics API serves to the
// channel owner under yt-analytics.readonly -- no separate scope needed.

// process.cwd(), not __dirname -- Next.js bundles this file into
// .next/server/..., so __dirname at runtime is nowhere near the real
// project root. cwd() is the project root in both `next dev` and the
// deployed server.
const PROJECT_ROOT = process.cwd();
const CLIENT_SECRET_PATH = path.join(PROJECT_ROOT, '.google-youtube-analytics-client-secret.json');
const TOKENS_PATH = path.join(PROJECT_ROOT, '.google-youtube-analytics-tokens.json');

interface Creds { clientId: string; clientSecret: string; refreshToken: string }

function loadCreds(): Creds | null {
  const envId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const envSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const envRefresh = process.env.YOUTUBE_REFRESH_TOKEN;
  if (envId && envSecret && envRefresh) {
    return { clientId: envId, clientSecret: envSecret, refreshToken: envRefresh };
  }
  try {
    const secretRaw = readFileSync(CLIENT_SECRET_PATH, 'utf8');
    const tokensRaw = readFileSync(TOKENS_PATH, 'utf8');
    const secret = JSON.parse(secretRaw);
    const installed = secret.installed ?? secret.web;
    const tokens = JSON.parse(tokensRaw);
    if (!installed?.client_id || !installed?.client_secret || !tokens?.refresh_token) return null;
    return { clientId: installed.client_id, clientSecret: installed.client_secret, refreshToken: tokens.refresh_token };
  } catch {
    return null;
  }
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

// Real token refresh against Google's OAuth2 token endpoint -- the saved
// refresh_token is exchanged for a short-lived access_token on every call
// (cached in-memory per warm serverless instance until ~1 min before expiry).
async function getAccessToken(): Promise<string> {
  const creds = loadCreds();
  if (!creds) throw new Error('YouTube Analytics credentials not configured (missing YOUTUBE_OAUTH_CLIENT_ID/_SECRET/_REFRESH_TOKEN env vars, and no local .google-youtube-analytics-*.json files found).');

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`YouTube OAuth token refresh failed: ${res.status} ${JSON.stringify(body)}`);
  }
  cachedAccessToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function googleGet(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface VideoMeta {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
}

export interface VideoAnalytics {
  views: number | null;
  averageViewPercentage: number | null; // 0-100
  impressions: number | null;
  impressionClickThroughRate: number | null; // 0-100 (%), i.e. thumbnail CTR
  hasEnoughData: boolean;
}

// YouTube Data API v3 videos.list -- title + thumbnail, batched (comma-
// separated ids, up to 50 per call, we only ever have a handful of LF videos).
export async function fetchVideoMeta(videoIds: string[]): Promise<Record<string, VideoMeta>> {
  if (videoIds.length === 0) return {};
  const accessToken = await getAccessToken();
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}`;
  const body = await googleGet(url, accessToken);
  const out: Record<string, VideoMeta> = {};
  for (const item of (body.items as Record<string, unknown>[] | undefined) ?? []) {
    const id = item.id as string;
    const snippet = item.snippet as Record<string, unknown>;
    const thumbnails = snippet.thumbnails as Record<string, { url: string }> | undefined;
    out[id] = {
      id,
      title: snippet.title as string,
      thumbnailUrl: thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null,
      publishedAt: snippet.publishedAt as string,
    };
  }
  return out;
}

// YouTube Analytics API v2 reports.query -- real watch metrics per video.
//
// Thumbnail CTR / impressions are deliberately NOT queried here: confirmed
// live (2026-09-30) that the public YouTube Analytics API rejects
// `impressions`/`impressionClickThroughRate` outright ("Unknown identifier
// (impressions) given in field parameters.metrics", HTTP 400) on every
// video tried, regardless of the yt-analytics.readonly scope. Cross-checked
// against Google's own published metrics list
// (developers.google.com/youtube/analytics/metrics): impressions/thumbnail
// CTR are not in it. That data only exists in the YouTube Studio UI's
// "Reach" tab -- Google has never exposed it through the public Analytics
// API. This is a real platform limitation, not a bug or a missing scope, so
// impressionClickThroughRate/impressions are always returned null with
// ctrAvailable: false, and the dashboard should say so plainly rather than
// showing a blank cell.
export async function fetchVideoAnalytics(videoId: string, publishedAt: string): Promise<VideoAnalytics> {
  const accessToken = await getAccessToken();
  const startDate = publishedAt.slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);
  const base = 'https://youtubeanalytics.googleapis.com/v2/reports';

  let views: number | null = null;
  let averageViewPercentage: number | null = null;
  let hasEnoughData = true;

  try {
    const url = `${base}?ids=channel%3D%3DMINE&startDate=${startDate}&endDate=${endDate}&metrics=views,averageViewPercentage&filters=video%3D%3D${videoId}`;
    const body = await googleGet(url, accessToken);
    const row = (body.rows as number[][] | undefined)?.[0];
    if (row) {
      views = row[0] ?? null;
      averageViewPercentage = row[1] ?? null;
    } else {
      // No row at all = too little data yet (e.g. brand-new video) --
      // graceful, not an error.
      hasEnoughData = false;
    }
  } catch (e) {
    hasEnoughData = false;
    console.error(`[youtubeAnalytics] views/avg%% query failed for ${videoId}:`, (e as Error).message);
  }

  return { views, averageViewPercentage, impressions: null, impressionClickThroughRate: null, hasEnoughData };
}

export interface ChannelUpload {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number | null;
  privacyStatus: string; // public | unlisted | private
}

// Every upload on the signed-in channel (about 7 quota units for 122 uploads):
// channels.list (1) -> playlistItems.list (1 per 50, paged) -> videos.list (1 per 50 ids).
// Returns ALL privacy states; the caller decides what to show. Views are the
// Data API's statistics.viewCount (lifetime), the same number for every video.
export async function fetchChannelUploads(): Promise<ChannelUpload[]> {
  const accessToken = await getAccessToken();
  const api = 'https://www.googleapis.com/youtube/v3';
  const ch = await googleGet(`${api}/channels?part=contentDetails&mine=true`, accessToken);
  const uploadsId = (((ch.items as Record<string, unknown>[] | undefined)?.[0]?.contentDetails as Record<string, unknown> | undefined)
    ?.relatedPlaylists as Record<string, string> | undefined)?.uploads;
  if (!uploadsId) throw new Error('YouTube channel has no uploads playlist.');

  const ids: string[] = [];
  let pageToken = '';
  do {
    const page = await googleGet(`${api}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploadsId}${pageToken ? `&pageToken=${pageToken}` : ''}`, accessToken);
    for (const it of (page.items as Record<string, unknown>[] | undefined) ?? []) {
      const vid = (it.contentDetails as Record<string, string> | undefined)?.videoId;
      if (vid) ids.push(vid);
    }
    pageToken = (page.nextPageToken as string | undefined) ?? '';
  } while (pageToken);

  const out: ChannelUpload[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const body = await googleGet(`${api}/videos?part=snippet,statistics,status&id=${batch.join(',')}`, accessToken);
    for (const item of (body.items as Record<string, unknown>[] | undefined) ?? []) {
      const snippet = item.snippet as Record<string, unknown>;
      const thumbs = snippet.thumbnails as Record<string, { url: string }> | undefined;
      const stats = item.statistics as Record<string, string> | undefined;
      const status = item.status as Record<string, string> | undefined;
      out.push({
        id: item.id as string,
        title: snippet.title as string,
        thumbnailUrl: thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? null,
        publishedAt: snippet.publishedAt as string,
        views: stats?.viewCount !== undefined ? Number(stats.viewCount) : null,
        privacyStatus: status?.privacyStatus ?? 'private',
      });
    }
  }
  return out;
}

// Long form vs Short. NOT decided by duration (Shorts can be 3 minutes long).
// Tested 2026-10-05: the Analytics API rejects dimensions=video,creatorContentType
// (HTTP 400 "query is not supported"), but one query per type works:
// dimensions=video + filters=creatorContentType==shorts (and ==videoOnDemand),
// values lowercase camelCase. Two Analytics calls, separate quota from the Data API.
async function videoIdsOfType(type: 'shorts' | 'videoOnDemand', accessToken: string): Promise<Set<string>> {
  const endDate = new Date().toISOString().slice(0, 10);
  const url = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=2019-01-01&endDate=${endDate}&metrics=views&dimensions=video&filters=creatorContentType%3D%3D${type}&sort=-views&maxResults=200`;
  const body = await googleGet(url, accessToken);
  return new Set(((body.rows as (string | number)[][] | undefined) ?? []).map((r) => String(r[0])));
}

// Fallback for a public video that is in neither list (for example no views yet):
// /shorts/<id> answers 200 for a real Short and redirects (303) to /watch for
// anything else. redirect: 'manual' is required, fetch follows redirects by default.
// A 200 for a real Short is not tested (the channel has no public Shorts today).
async function isShortByRedirect(id: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'manual' });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function classifyFormats(ids: string[]): Promise<Record<string, 'short' | 'long'>> {
  const accessToken = await getAccessToken();
  const [shorts, long] = await Promise.all([videoIdsOfType('shorts', accessToken), videoIdsOfType('videoOnDemand', accessToken)]);
  const out: Record<string, 'short' | 'long'> = {};
  for (const id of ids) {
    if (shorts.has(id)) out[id] = 'short';
    else if (long.has(id)) out[id] = 'long';
    else out[id] = (await isShortByRedirect(id)) ? 'short' : 'long';
  }
  return out;
}
