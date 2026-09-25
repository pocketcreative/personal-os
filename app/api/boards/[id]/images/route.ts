import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import {
  ALLOWED_IMAGE_TYPES, BOARD_IMAGES_BUCKET, MAX_IMAGE_UPLOAD_BYTES, isSafePathPart, storagePathFor,
} from '@/lib/boardImages';

// POST /api/boards/[id]/images?fileId=... with the raw image bytes as the body
// and the image type as content-type. Stored at <boardId>/<fileId> in the
// private bucket (upsert, so re-saving the same image replaces it).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fileId = req.nextUrl.searchParams.get('fileId') ?? '';
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!isSafePathPart(id) || !isSafePathPart(fileId)) {
    return NextResponse.json({ error: 'bad id' }, { status: 400 });
  }
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'unsupported image type' }, { status: 415 });
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: 'empty image' }, { status: 400 });
  if (bytes.length > MAX_IMAGE_UPLOAD_BYTES) return NextResponse.json({ error: 'image too large' }, { status: 413 });

  const db = serviceClient();
  const { error: boardErr } = await db.from('boards').select('id').eq('user_id', USER_ID).eq('id', id).single();
  if (boardErr) return NextResponse.json({ error: 'board not found' }, { status: 404 });

  const path = storagePathFor(id, fileId);
  const { error } = await db.storage.from(BOARD_IMAGES_BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path, size: bytes.length });
}
