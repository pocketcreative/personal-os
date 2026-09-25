import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_SIDE, SHRINK_THRESHOLD_BYTES, formatBytes, isSafePathPart, isStoredEntry, outputType, shouldShrink,
  storagePathFor, storedImageBytes, targetSize, toStoredEntry,
} from '@/lib/boardImages';
import { buildScene, isSceneTooLargeMessage, sceneTooLargeMessage } from '@/lib/boardScene';

describe('shouldShrink', () => {
  it('shrinks raster images over the threshold only', () => {
    expect(shouldShrink('image/png', SHRINK_THRESHOLD_BYTES + 1)).toBe(true);
    expect(shouldShrink('image/jpeg', SHRINK_THRESHOLD_BYTES + 1)).toBe(true);
    expect(shouldShrink('image/webp', SHRINK_THRESHOLD_BYTES + 1)).toBe(true);
    expect(shouldShrink('image/gif', SHRINK_THRESHOLD_BYTES + 1)).toBe(true);
    expect(shouldShrink('image/png', SHRINK_THRESHOLD_BYTES)).toBe(false);
    expect(shouldShrink('image/png', 1000)).toBe(false);
  });
  it('never shrinks svg or unknown types', () => {
    expect(shouldShrink('image/svg+xml', 5_000_000)).toBe(false);
    expect(shouldShrink('application/pdf', 5_000_000)).toBe(false);
  });
});

describe('targetSize', () => {
  it('caps the longest side and keeps the ratio', () => {
    expect(targetSize(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(targetSize(1000, 4000)).toEqual({ width: 400, height: 1600 });
  });
  it('never upscales', () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(MAX_IMAGE_SIDE, 10)).toEqual({ width: MAX_IMAGE_SIDE, height: 10 });
  });
  it('never returns a zero side', () => {
    expect(targetSize(100000, 1).height).toBe(1);
  });
});

describe('outputType', () => {
  it('uses jpeg when nothing is transparent', () => {
    expect(outputType(false, true)).toBe('image/jpeg');
    expect(outputType(false, false)).toBe('image/jpeg');
  });
  it('keeps transparency with webp, else png', () => {
    expect(outputType(true, true)).toBe('image/webp');
    expect(outputType(true, false)).toBe('image/png');
  });
});

describe('formatBytes', () => {
  it('uses KB below 1 MB and MB with one decimal above', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(512_000)).toBe('512 KB');
    expect(formatBytes(1_000_000)).toBe('1.0 MB');
    expect(formatBytes(4_260_000)).toBe('4.3 MB');
    expect(formatBytes(-5)).toBe('0 KB');
  });
});

describe('scene entry conversion', () => {
  it('builds the stored form with no dataURL', () => {
    const e = toStoredEntry('board1', 'file1', 'image/jpeg', 123, 4567);
    expect(e).toEqual({ id: 'file1', mimeType: 'image/jpeg', created: 123, storagePath: 'board1/file1', size: 4567 });
    expect('dataURL' in e).toBe(false);
    expect(storagePathFor('b', 'f')).toBe('b/f');
  });
  it('recognises stored entries and sums their sizes', () => {
    const files = {
      a: toStoredEntry('b', 'a', 'image/png', 1, 1000),
      b: toStoredEntry('b', 'b', 'image/png', 1, 2500),
      legacy: { id: 'legacy', mimeType: 'image/png', dataURL: 'data:image/png;base64,AAAA' },
    };
    expect(isStoredEntry(files.a)).toBe(true);
    expect(isStoredEntry(files.legacy)).toBe(false);
    expect(storedImageBytes(files)).toBe(3500);
    expect(storedImageBytes(null)).toBe(0);
  });
  it('a stored entry survives buildScene when a live element uses it', () => {
    const entry = toStoredEntry('b', 'f1', 'image/png', 1, 10);
    const scene = buildScene([{ id: 'x', type: 'image', fileId: 'f1' }], { f1: entry }, {});
    expect(scene.files.f1).toEqual(entry);
  });
});

describe('isSafePathPart', () => {
  it('accepts plain ids and refuses path tricks', () => {
    expect(isSafePathPart('3f9a-C_1')).toBe(true);
    expect(isSafePathPart('..')).toBe(false);
    expect(isSafePathPart('a/b')).toBe(false);
    expect(isSafePathPart('')).toBe(false);
  });
});

describe('too-large message', () => {
  it('includes the real size and is recognised', () => {
    const m = sceneTooLargeMessage(4_300_000);
    expect(m).toContain('4.3 MB');
    expect(isSceneTooLargeMessage(m)).toBe(true);
    expect(isSceneTooLargeMessage('Save failed (500)')).toBe(false);
  });
});
