import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { BOARD_IMAGES_BUCKET, isSafePathPart, storagePathFor } from '@/lib/boardImages';

// Streams one image from the private bucket. The bucket is never public, so
// this route (behind the same login middleware as every other route) is the
// only way the browser sees these bytes.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  if (!isSafePathPart(id) || !isSafePathPart(fileId)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }
  const { data, error } = await serviceClient().storage.from(BOARD_IMAGES_BUCKET).download(storagePathFor(id, fileId));
  if (error || !data) return NextResponse.json({ error: 'image not found' }, { status: 404 });
  return new NextResponse(data.stream(), {
    headers: { 'content-type': data.type || 'application/octet-stream', 'cache-control': 'private, max-age=3600' },
  });
}
