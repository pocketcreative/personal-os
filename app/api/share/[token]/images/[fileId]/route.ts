import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { BOARD_IMAGES_BUCKET, isSafePathPart, isStoredEntry, storagePathFor } from '@/lib/boardImages';
import { parseScene } from '@/lib/boardScene';
import { PUBLIC_HEADERS } from '@/lib/shares';
import { findActiveShare } from '@/lib/shareLookup';

// PUBLIC route (no login, see middleware.ts). Streams one image of a shared
// board. The file id must be one of the stored images in that board's own
// scene; the storage path is built here from the share's board id, never from
// anything the caller sends.
function notFound() {
  return NextResponse.json({ error: 'not found' }, { status: 404, headers: PUBLIC_HEADERS });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const share = await findActiveShare(token);
  if (!share || share.resource_type !== 'board' || !isSafePathPart(fileId)) return notFound();

  const db = serviceClient();
  const { data: board } = await db.from('boards').select('scene').eq('id', share.resource_id).maybeSingle();
  if (!board) return notFound();
  const files = parseScene(board.scene).files;
  if (!Object.prototype.hasOwnProperty.call(files, fileId) || !isStoredEntry(files[fileId])) return notFound();

  const { data, error } = await db.storage.from(BOARD_IMAGES_BUCKET).download(storagePathFor(share.resource_id, fileId));
  if (error || !data) return notFound();
  return new NextResponse(data.stream(), {
    headers: {
      ...PUBLIC_HEADERS,
      'cache-control': 'private, no-store',
      'content-type': data.type || 'application/octet-stream',
      // An SVG opened directly must not run scripts on the app's origin.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
    },
  });
}
