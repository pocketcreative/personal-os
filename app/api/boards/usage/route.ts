import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { sceneByteSize } from '@/lib/boardScene';
import { BOARD_IMAGES_BUCKET } from '@/lib/boardImages';

// Total space used by ALL boards (active and archived): scene JSON bytes from
// the boards table plus the bytes of every object in the images bucket. One
// list call for the board folders, then one per folder, each up to 1000 items.
export async function GET() {
  const db = serviceClient();
  const { data: rows, error } = await db.from('boards').select('scene').eq('user_id', USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const sceneBytes = rows.reduce((sum, r) => sum + sceneByteSize(r.scene), 0);

  const bucket = db.storage.from(BOARD_IMAGES_BUCKET);
  const root = await bucket.list('', { limit: 1000 });
  if (root.error) return NextResponse.json({ error: root.error.message }, { status: 500 });
  let imageBytes = 0;
  const folders = await Promise.all(root.data.map(async (entry) => {
    if (entry.id) return entry.metadata?.size ?? 0; // a loose file at the root
    const inner = await bucket.list(entry.name, { limit: 1000 });
    if (inner.error) throw new Error(inner.error.message);
    return inner.data.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0);
  })).catch(() => null);
  if (!folders) return NextResponse.json({ error: 'could not read image storage' }, { status: 500 });
  for (const n of folders) imageBytes += n;

  return NextResponse.json({ bytes: sceneBytes + imageBytes, sceneBytes, imageBytes }, { headers: { 'cache-control': 'no-store' } });
}
