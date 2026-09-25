import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStoredImages, storeSceneImages, type ImageCache } from '@/lib/boardImagesClient';
import { toStoredEntry } from '@/lib/boardImages';
import type { BoardScene } from '@/lib/boardScene';

// Small png (under the shrink threshold, so the shrink step passes it through).
const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function sceneWith(files: Record<string, unknown>): BoardScene {
  return { elements: [], files, appState: {} };
}

afterEach(() => vi.unstubAllGlobals());

describe('storeSceneImages', () => {
  it('uploads a dataURL image once and swaps it for a storagePath entry', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ path: 'b1/f1', size: 70 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const cache: ImageCache = new Map();
    const scene = sceneWith({ f1: { id: 'f1', mimeType: 'image/png', dataURL: DATA_URL, created: 5 } });

    const out = await storeSceneImages('b1', scene, cache);
    expect(out.files.f1).toEqual({ id: 'f1', mimeType: 'image/png', created: 5, storagePath: 'b1/f1', size: 70 });
    expect(JSON.stringify(out)).not.toContain('base64');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/boards/b1/images?fileId=f1');
    expect((init.body as Blob).size).toBe(70);

    // Second autosave with the same image: no second upload.
    const again = await storeSceneImages('b1', scene, cache);
    expect(again.files.f1).toEqual(out.files.f1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-uploads when the dataURL changed for the same id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ path: 'b1/f1', size: 71 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const cache: ImageCache = new Map([['f1', { source: 'data:image/png;base64,OLD', mimeType: 'image/png', size: 1 }]]);
    await storeSceneImages('b1', sceneWith({ f1: { id: 'f1', mimeType: 'image/png', dataURL: DATA_URL } }), cache);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when an upload fails, so no scene is saved without the image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const scene = sceneWith({ f1: { id: 'f1', mimeType: 'image/png', dataURL: DATA_URL } });
    await expect(storeSceneImages('b1', scene, new Map())).rejects.toThrow();
  });

  it('leaves already-stored entries alone', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const stored = toStoredEntry('b1', 'f1', 'image/png', 1, 70);
    const out = await storeSceneImages('b1', sceneWith({ f1: stored }), new Map());
    expect(out.files.f1).toEqual(stored);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('loadStoredImages', () => {
  it('passes legacy inline entries through and reports images that fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const legacy = { id: 'old', mimeType: 'image/png', dataURL: DATA_URL };
    const stored = toStoredEntry('b1', 'f1', 'image/png', 1, 70);
    const out = await loadStoredImages('b1', { old: legacy, f1: stored }, new Map());
    expect(out.files).toEqual({ old: legacy });
    expect(out.unloaded).toEqual({ f1: stored });
  });
});
