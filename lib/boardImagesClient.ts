'use client';
// Browser side of board images: shrink, upload, and fetch back. The pure
// decisions (when to shrink, target size, output type, entry shape) live in
// lib/boardImages.ts.
import {
  SHRINK_QUALITY, isStoredEntry, outputType, shouldShrink, shrunkFileName, targetSize, toStoredEntry, type StoredFile,
} from '@/lib/boardImages';
import type { BoardScene } from '@/lib/boardScene';

// Per file id: the editor's own dataURL (`source`) and what is in storage.
// An image whose source has not changed is never uploaded again.
export type ImageCache = Map<string, { source: string; mimeType: string; size: number }>;

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const px = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
  return false;
}

// Never throws: any failure returns the original untouched.
export async function shrinkDataUrl(mimeType: string, dataURL: string): Promise<{ dataURL: string; mimeType: string }> {
  const original = { dataURL, mimeType };
  try {
    if (!shouldShrink(mimeType, dataURL.length)) return original;
    // onload, not img.decode(): decode() never settles in a background tab.
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image failed to load'));
      img.src = dataURL;
    });
    const { width, height } = targetSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);
    const transparent = mimeType !== 'image/jpeg' && hasTransparency(ctx, width, height);
    const canWebp = transparent && canvas.toDataURL('image/webp').startsWith('data:image/webp');
    const type = outputType(transparent, canWebp);
    const out = canvas.toDataURL(type, SHRINK_QUALITY);
    if (!out.startsWith(`data:${type}`) || out.length >= dataURL.length) return original;
    return { dataURL: out, mimeType: type };
  } catch {
    return original;
  }
}

function dataUrlToBlob(dataURL: string, fallbackType: string): Blob {
  const comma = dataURL.indexOf(',');
  const head = dataURL.slice(5, comma);
  const type = head.split(';')[0] || fallbackType;
  const body = dataURL.slice(comma + 1);
  if (!head.endsWith(';base64')) return new Blob([decodeURIComponent(body)], { type });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Longest a file may take to shrink before the original is handed over instead.
const SHRINK_FILE_TIMEOUT_MS = 20_000;

// Shrinks one image File the way saved images are shrunk. Never throws: if the
// result is not smaller, or anything fails, the original File comes back.
export async function shrinkImageFile(file: File): Promise<File> {
  const gaveUp = new Promise<File>((resolve) => setTimeout(() => resolve(file), SHRINK_FILE_TIMEOUT_MS));
  return Promise.race([shrinkFileInner(file), gaveUp]);
}

async function shrinkFileInner(file: File): Promise<File> {
  try {
    const dataURL = await blobToDataUrl(file);
    const small = await shrinkDataUrl(file.type, dataURL);
    if (small.dataURL === dataURL) return file;
    const blob = dataUrlToBlob(small.dataURL, small.mimeType);
    if (blob.size >= file.size) return file;
    return new File([blob], shrunkFileName(file.name, blob.type), { type: blob.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

// Raw image bytes in the body, the file id in the query, the type in content-type.
async function uploadBoardImage(boardId: string, fileId: string, blob: Blob): Promise<{ path: string; size: number }> {
  const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/images?fileId=${encodeURIComponent(fileId)}`, {
    method: 'POST', headers: { 'content-type': blob.type }, body: blob,
  });
  if (!res.ok) throw new Error(`Image upload failed (${res.status})`);
  return res.json();
}

// Save side. Every file that still carries a dataURL is shrunk and uploaded
// (skipped when the cache already has that exact dataURL), then swapped for its
// storagePath entry. Throws if any upload fails, so the caller never saves a
// scene that lost an image.
export async function storeSceneImages(boardId: string, scene: BoardScene, cache: ImageCache): Promise<BoardScene> {
  const files: Record<string, unknown> = {};
  for (const [fileId, f] of Object.entries(scene.files)) {
    const file = f as { mimeType?: string; dataURL?: unknown; created?: unknown };
    if (typeof file.dataURL !== 'string') { files[fileId] = f; continue; }
    let hit = cache.get(fileId);
    if (!hit || hit.source !== file.dataURL) {
      const mimeType = file.mimeType || file.dataURL.slice(5, file.dataURL.indexOf(';'));
      const small = await shrinkDataUrl(mimeType, file.dataURL);
      const up = await uploadBoardImage(boardId, fileId, dataUrlToBlob(small.dataURL, small.mimeType));
      hit = { source: file.dataURL, mimeType: small.mimeType, size: up.size };
      cache.set(fileId, hit);
    }
    files[fileId] = toStoredEntry(boardId, fileId, hit.mimeType, file.created, hit.size);
  }
  return { ...scene, files };
}

// Load side. Turns each stored entry back into a dataURL entry for Excalidraw
// and seeds the cache so it is not re-uploaded. An image that cannot be fetched
// is returned in `unloaded` so the editor can keep its entry in the next save
// instead of losing the reference. Inline (legacy) entries pass through as is.
export async function loadStoredImages(
  boardId: string, files: Record<string, unknown>, cache: ImageCache,
): Promise<{ files: Record<string, unknown>; unloaded: Record<string, StoredFile> }> {
  const loaded: Record<string, unknown> = {};
  const unloaded: Record<string, StoredFile> = {};
  await Promise.all(Object.entries(files).map(async ([fileId, f]) => {
    if (!isStoredEntry(f)) { loaded[fileId] = f; return; }
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/images/${encodeURIComponent(fileId)}`);
      if (!res.ok) throw new Error(String(res.status));
      const dataURL = await blobToDataUrl(await res.blob());
      cache.set(fileId, { source: dataURL, mimeType: f.mimeType, size: f.size ?? 0 });
      loaded[fileId] = { id: fileId, mimeType: f.mimeType, created: f.created, dataURL };
    } catch {
      unloaded[fileId] = f;
    }
  }));
  return { files: loaded, unloaded };
}
