// Pure helpers for a saved Excalidraw board scene. No browser or Excalidraw
// imports on purpose, so the API routes, the editor and the vitest tests can
// all share them.
//
// What gets saved: elements, files (images) and a SMALL appState subset.
// Excalidraw's full appState holds transient UI state (open menus, active
// tool, selection) and a `collaborators` Map that does not survive JSON, so
// it is never persisted, only the four fields in pickAppState.

// Host request limit is about 4.5 MB; leave room for the title/updated_at
// wrapper and JSON overhead.
export const MAX_SCENE_BYTES = 4_000_000;

export const SCENE_TOO_LARGE_MESSAGE = 'Board too large to save: remove or shrink images';
// Every column except the scene: it can be MBs of images and the list never needs it.
export const BOARD_LIST_COLUMNS = 'id,user_id,title,status,created_at,updated_at';

export const BOARDS_MISSING_MESSAGE = 'Boards need one database step, ask Jarvis';

export interface BoardScene {
  elements: unknown[];
  files: Record<string, unknown>;
  appState: { viewBackgroundColor?: string; scrollX?: number; scrollY?: number; zoom?: { value: number } };
}

interface SceneElement { isDeleted?: boolean; fileId?: string | null }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function pickAppState(appState: unknown): BoardScene['appState'] {
  const out: BoardScene['appState'] = {};
  if (!isRecord(appState)) return out;
  if (typeof appState.viewBackgroundColor === 'string') out.viewBackgroundColor = appState.viewBackgroundColor;
  if (typeof appState.scrollX === 'number') out.scrollX = appState.scrollX;
  if (typeof appState.scrollY === 'number') out.scrollY = appState.scrollY;
  const zoom = appState.zoom;
  if (isRecord(zoom) && typeof zoom.value === 'number') out.zoom = { value: zoom.value };
  return out;
}

// Deleted elements and image files no live element points to are dropped:
// they are dead weight against the size limit.
export function buildScene(elements: readonly unknown[], files: unknown, appState: unknown): BoardScene {
  const live = (elements as SceneElement[]).filter((e) => !e.isDeleted);
  const used = new Set<string>();
  for (const e of live) if (typeof e.fileId === 'string') used.add(e.fileId);
  const keptFiles: Record<string, unknown> = {};
  if (isRecord(files)) {
    for (const id of Object.keys(files)) if (used.has(id)) keptFiles[id] = files[id];
  }
  return { elements: live, files: keptFiles, appState: pickAppState(appState) };
}

// Safe to call on anything read back from the database ('{}' for a new board).
export function parseScene(raw: unknown): BoardScene {
  if (!isRecord(raw)) return { elements: [], files: {}, appState: {} };
  return {
    elements: Array.isArray(raw.elements) ? raw.elements : [],
    files: isRecord(raw.files) ? raw.files : {},
    appState: pickAppState(raw.appState),
  };
}

export function sceneByteSize(scene: unknown): number {
  return new TextEncoder().encode(JSON.stringify(scene)).length;
}

export function isSceneTooLarge(scene: unknown): boolean {
  return sceneByteSize(scene) > MAX_SCENE_BYTES;
}

// Supabase/PostgREST error when the boards table has not been created yet:
// PGRST205 (not in schema cache) or Postgres 42P01 (undefined_table).
export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01'
    || /could not find the table|relation .* does not exist/i.test(error.message ?? '');
}
