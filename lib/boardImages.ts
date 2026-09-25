// Pure helpers for board images. No browser, Excalidraw or Supabase imports on
// purpose, so the editor, the API routes and the vitest tests can all share them.
//
// Images are not kept in the scene JSON. Each one is shrunk in the browser,
// uploaded to the private `board-images` bucket, and the saved scene keeps only
// a small { id, mimeType, created, storagePath, size } entry for it.

export const BOARD_IMAGES_BUCKET = 'board-images';

// Raster images whose dataURL is bigger than this get re-encoded.
export const SHRINK_THRESHOLD_BYTES = 250_000;
export const MAX_IMAGE_SIDE = 1600;

// Excalidraw refuses any inserted image file over 4 MiB (not configurable), so
// raster files over this are shrunk in the browser before Excalidraw sees them.
export const PRE_SHRINK_FILE_BYTES = 2_500_000;
export const SHRINK_QUALITY = 0.82;

// A shrunk image is far below this; it stays under the host's 4.5 MB request limit.
export const MAX_IMAGE_UPLOAD_BYTES = 4_000_000;

export const IMAGE_UPLOAD_FAILED_MESSAGE = 'could not upload image';

// Storage plan the header shows the total against.
export const STORAGE_LIMIT_LABEL = '1 GB';

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'] as const;
const RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export type ShrunkType = 'image/jpeg' | 'image/webp' | 'image/png';

export interface StoredFile { id: string; mimeType: string; created: number; storagePath: string; size: number }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// SVG is vector, so it is never shrunk.
export function shouldShrink(mimeType: string, dataUrlLength: number): boolean {
  return RASTER_TYPES.includes(mimeType) && dataUrlLength > SHRINK_THRESHOLD_BYTES;
}

// A file (drop, paste or picker) that must be shrunk before Excalidraw gets it.
export function shouldPreShrinkFile(file: { type: string; size: number }): boolean {
  return RASTER_TYPES.includes(file.type) && file.size > PRE_SHRINK_FILE_BYTES;
}

// The files in a list that need shrinking (empty when the list can be left alone).
export function filesToPreShrink<T extends { type: string; size: number }>(files: ArrayLike<T> | null | undefined): T[] {
  return files ? Array.from(files).filter(shouldPreShrinkFile) : [];
}

// A shrunk file keeps its name but takes the extension of its new type.
export function shrunkFileName(name: string, type: string): string {
  const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name || 'image'}.${ext}`;
}

// Longest side capped at max, aspect ratio kept, never upscaled.
export function targetSize(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// JPEG when nothing is transparent; otherwise WebP if the browser can encode it, else PNG.
export function outputType(hasTransparency: boolean, canEncodeWebp: boolean): ShrunkType {
  if (!hasTransparency) return 'image/jpeg';
  return canEncodeWebp ? 'image/webp' : 'image/png';
}

// MB with one decimal, KB below 1 MB. Decimal units (1 MB = 1,000,000 bytes),
// the same as the 4 MB scene limit and the 1 GB plan.
export function formatBytes(bytes: number): string {
  const n = Math.max(0, bytes);
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`;
  return `${(n / 1_000_000).toFixed(1)} MB`;
}

// Ids end up in a storage path, so anything but a plain id is refused.
export function isSafePathPart(part: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(part);
}

export function storagePathFor(boardId: string, fileId: string): string {
  return `${boardId}/${fileId}`;
}

// The saved-scene form of an image entry: no dataURL.
export function toStoredEntry(boardId: string, fileId: string, mimeType: string, created: unknown, size: number): StoredFile {
  return {
    id: fileId,
    mimeType,
    created: typeof created === 'number' ? created : Date.now(),
    storagePath: storagePathFor(boardId, fileId),
    size,
  };
}

export function isStoredEntry(file: unknown): file is StoredFile {
  return isRecord(file) && typeof file.storagePath === 'string' && typeof file.dataURL !== 'string';
}

// Total bytes of the images already in storage, from the size stored on each entry.
export function storedImageBytes(files: unknown): number {
  if (!isRecord(files)) return 0;
  let total = 0;
  for (const f of Object.values(files)) if (isStoredEntry(f) && typeof f.size === 'number') total += f.size;
  return total;
}
