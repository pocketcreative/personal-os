import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { driveClient } from '@/lib/googleDrive';

// Streams a Google Drive file through this server so the browser gets a real
// <video> src it fully controls (no Drive iframe/opaque player), while the
// file itself stays hosted on Drive -- this route never buffers or persists
// the bytes, it just proxies them through, one request at a time.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DriveErrorLike = {
  code?: number | string;
  response?: { status?: number };
  message?: string;
};

// googleapis (fetch-based, v178+) returns a Fetch API Headers instance at
// runtime here, but its own TS types still declare the old Node
// IncomingHttpHeaders shape (a plain lowercase-keyed object) -- confirmed by
// directly inspecting the response in dev. Read defensively so this keeps
// working whichever shape actually comes back.
function getDriveHeader(headers: unknown, name: string): string | null {
  if (headers && typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const value = (headers as Record<string, string | string[] | undefined> | undefined)?.[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  if (!fileId || typeof fileId !== 'string') {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  let drive;
  try {
    drive = driveClient();
  } catch (err) {
    console.error('Google Drive client not configured:', (err as Error)?.message);
    return NextResponse.json(
      { error: 'server is not configured for video streaming' },
      { status: 500 },
    );
  }

  const range = req.headers.get('range');

  try {
    const driveRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      {
        responseType: 'stream',
        headers: range ? { Range: range } : undefined,
      },
    );

    const contentType = getDriveHeader(driveRes.headers, 'content-type') || 'video/mp4';
    const contentLength = getDriveHeader(driveRes.headers, 'content-length');
    const contentRange = getDriveHeader(driveRes.headers, 'content-range');
    const etag = getDriveHeader(driveRes.headers, 'etag');
    const lastModified = getDriveHeader(driveRes.headers, 'last-modified');

    const responseHeaders: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      // Content at a given fileId is immutable by convention: a re-edit in
      // this app always uploads a NEW Drive file (new fileId, new Supabase
      // video_link), it never overwrites bytes under an existing fileId. So
      // it's safe to cache this response hard, both in the browser (max-age
      // + immutable, so it never even revalidates) and at Vercel's edge
      // (s-maxage -- required in addition to max-age, Vercel's CDN ignores
      // plain max-age).
      //
      // This route stays behind auth: Vercel's routing middleware runs on
      // every request *before* any CDN cache lookup (docs: "Because it runs
      // globally before the cache..."), so middleware.ts's session/
      // x-api-secret check is never skipped for a cache hit -- caching the
      // video body doesn't leak it to an unauthenticated caller.
      //
      // Two things this header can't do, both confirmed against Vercel's
      // documented CDN cache-eligibility rules, not assumed:
      // 1. It won't get range-request (206) responses cached at Vercel's
      //    edge -- Vercel excludes any request carrying a `Range` header,
      //    and any 206 response, from CDN caching by design. Real <video>
      //    playback in Chrome/Safari sends Range on essentially every
      //    request, so most plays won't hit the shared edge cache no matter
      //    what header is set here.
      //  2. Even a non-range 200 response only qualifies for Vercel's edge
      //    cache under 20MB (streaming function limit); several of these
      //    files (6-90MB) exceed that regardless of headers.
      // The real win from this header is the *browser's own* HTTP cache --
      // it does cache and reassemble 206/range responses locally (using the
      // ETag/Last-Modified below), so a repeat open of the same video on the
      // same device is served from disk with no round trip to Drive at all,
      // which is the actual case Brendan hit (slow reload in the OS).
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
    };
    if (contentLength) responseHeaders['Content-Length'] = contentLength;
    if (contentRange) responseHeaders['Content-Range'] = contentRange;
    if (etag) responseHeaders['ETag'] = etag;
    if (lastModified) responseHeaders['Last-Modified'] = lastModified;

    // driveRes.data is a Node Readable when responseType is 'stream'. Convert
    // to a Web ReadableStream so it can be piped straight into the Response
    // body without ever buffering the whole file in memory.
    const nodeStream = driveRes.data as unknown as Readable;
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    // Drive itself decides 200 vs 206 based on whether it honored the Range
    // header we forwarded -- pass that status straight through.
    return new Response(webStream, {
      status: driveRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const e = err as DriveErrorLike;
    const status = e.response?.status ?? (typeof e.code === 'number' ? e.code : undefined);

    if (status === 404) {
      return NextResponse.json({ error: 'file not found' }, { status: 404 });
    }
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: 'not authorized to access this file' },
        { status: 403 },
      );
    }

    console.error('Drive stream error for fileId', fileId, ':', e.message ?? err);
    return NextResponse.json({ error: 'failed to stream file' }, { status: 500 });
  }
}
