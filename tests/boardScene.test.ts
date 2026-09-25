import { describe, expect, it } from 'vitest';
import {
  MAX_SCENE_BYTES, buildScene, isMissingTableError, isSceneTooLarge, parseScene, pickAppState, sceneByteSize,
} from '@/lib/boardScene';

describe('pickAppState', () => {
  it('keeps only the safe view fields', () => {
    const out = pickAppState({
      viewBackgroundColor: '#fff', scrollX: 10, scrollY: -4, zoom: { value: 1.5 },
      collaborators: new Map(), openMenu: 'canvas', activeTool: { type: 'arrow' }, selectedElementIds: { a: true },
    });
    expect(out).toEqual({ viewBackgroundColor: '#fff', scrollX: 10, scrollY: -4, zoom: { value: 1.5 } });
  });
  it('tolerates junk', () => {
    expect(pickAppState(null)).toEqual({});
    expect(pickAppState({ scrollX: 'x', zoom: 3 })).toEqual({});
  });
});

describe('buildScene', () => {
  it('drops deleted elements and files no live element uses', () => {
    const scene = buildScene(
      [
        { id: 'a', type: 'rectangle' },
        { id: 'b', type: 'image', fileId: 'f1' },
        { id: 'c', type: 'image', fileId: 'f2', isDeleted: true },
      ],
      { f1: { id: 'f1' }, f2: { id: 'f2' }, f3: { id: 'f3' } },
      { scrollX: 1, selectedElementIds: { a: true } },
    );
    expect(scene.elements).toHaveLength(2);
    expect(Object.keys(scene.files)).toEqual(['f1']);
    expect(scene.appState).toEqual({ scrollX: 1 });
  });
});

describe('parseScene', () => {
  it('gives an empty scene for a new board ({})', () => {
    expect(parseScene({})).toEqual({ elements: [], files: {}, appState: {} });
    expect(parseScene(null)).toEqual({ elements: [], files: {}, appState: {} });
  });
  it('round-trips a built scene', () => {
    const built = buildScene([{ id: 'a' }], {}, { viewBackgroundColor: '#eee' });
    expect(parseScene(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });
  it('strips unsafe appState on read', () => {
    const s = parseScene({ elements: [], files: {}, appState: { collaborators: {}, scrollX: 2 } });
    expect(s.appState).toEqual({ scrollX: 2 });
  });
});

describe('size check', () => {
  it('counts bytes, not characters', () => {
    expect(sceneByteSize({ a: 'é' })).toBe(JSON.stringify({ a: 'é' }).length + 1);
  });
  it('flags only scenes over the limit', () => {
    expect(isSceneTooLarge({ elements: [] })).toBe(false);
    expect(isSceneTooLarge({ blob: 'x'.repeat(MAX_SCENE_BYTES) })).toBe(true);
  });
});

describe('isMissingTableError', () => {
  it('recognises both missing-table shapes', () => {
    expect(isMissingTableError({ code: 'PGRST205' })).toBe(true);
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ message: "Could not find the table 'public.boards' in the schema cache" })).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isMissingTableError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
