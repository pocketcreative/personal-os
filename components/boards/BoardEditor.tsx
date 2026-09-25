'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardsApiError, fetchBoard, saveBoard } from '@/lib/useBoards';
import {
  BOARDS_MISSING_MESSAGE, MAX_SCENE_BYTES, SCENE_TOO_LARGE_MESSAGE, buildScene, isSceneTooLargeMessage, parseScene,
  sceneByteSize, sceneTooLargeMessage,
} from '@/lib/boardScene';
import { IMAGE_UPLOAD_FAILED_MESSAGE, formatBytes, storedImageBytes, type StoredFile } from '@/lib/boardImages';
import { loadStoredImages, storeSceneImages, type ImageCache } from '@/lib/boardImagesClient';
import ShareControl from '@/components/shares/ShareControl';
import type { Board } from '@/lib/types';

// Excalidraw touches window/document on import, so it is client-only.
const ExcalidrawCanvas = dynamic(() => import('@/components/boards/ExcalidrawCanvas'), {
  ssr: false,
  loading: () => <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)', padding: 20 }}>Loading editor&hellip;</div>,
});

const AUTOSAVE_MS = 1500;

type Status = { kind: 'idle' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; reason: string };

type Latest = { elements: readonly unknown[]; files: unknown; appState: unknown };

export default function BoardEditor({ id }: { id: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Space this board uses: scene JSON plus its images in storage.
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  // Latest unsaved edits. Saves are serialised (one in flight at a time) so
  // each PATCH carries the updated_at the previous one returned.
  const latest = useRef<Latest | null>(null);
  const pendingTitle = useRef<string | null>(null);
  const updatedAt = useRef('');
  const inflight = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Images already in storage (by file id), so autosave never re-uploads them,
  // and stored images that could not be fetched on load, whose entries are kept
  // in the next save so their reference is not lost.
  const imageCache = useRef<ImageCache>(new Map());
  const unloaded = useRef<Record<string, StoredFile>>({});

  useEffect(() => {
    let cancelled = false;
    fetchBoard(id).then(async (b) => {
      const scene = parseScene(b.scene);
      const images = await loadStoredImages(id, scene.files, imageCache.current);
      if (cancelled) return;
      unloaded.current = images.unloaded;
      updatedAt.current = b.updated_at;
      setUsedBytes(sceneByteSize(b.scene ?? {}) + storedImageBytes(scene.files));
      setTitle(b.title);
      setBoard({ ...b, scene: { ...scene, files: images.files } });
    }).catch((e: Error) => {
      if (!cancelled) setLoadError(e instanceof BoardsApiError && e.missingTable ? BOARDS_MISSING_MESSAGE : e.message);
    });
    return () => { cancelled = true; };
  }, [id]);

  const flush = useCallback(async () => {
    if (inflight.current) { again.current = true; return; }
    inflight.current = true;
    try {
      do {
        again.current = false;
        const l = latest.current;
        const t = pendingTitle.current;
        latest.current = null;
        pendingTitle.current = null;
        if (!l && t === null) break;
        // Keep the unsaved edits so Retry (or the next change) sends them again,
        // unless a newer edit has already replaced them.
        const keepUnsaved = () => {
          if (l && !latest.current) latest.current = l;
          if (t !== null && pendingTitle.current === null) pendingTitle.current = t;
        };
        const patch: Record<string, unknown> = {};
        let used: number | null = null;
        if (t !== null) patch.title = t;
        if (l) {
          let scene = buildScene(l.elements, { ...unloaded.current, ...(l.files as Record<string, unknown>) }, l.appState);
          // Images go to storage first; a failed upload means nothing is sent, so
          // a scene that lost an image is never saved.
          setStatus({ kind: 'saving' });
          try {
            scene = await storeSceneImages(id, scene, imageCache.current);
          } catch {
            keepUnsaved();
            setStatus({ kind: 'error', reason: IMAGE_UPLOAD_FAILED_MESSAGE });
            break;
          }
          // Same limit as the API's 413, checked here first so the warning shows
          // without sending megabytes the host would reject.
          const size = sceneByteSize(scene);
          if (size > MAX_SCENE_BYTES) {
            setStatus({ kind: 'error', reason: sceneTooLargeMessage(size) });
            if (t === null) break;
          } else {
            patch.scene = scene;
            used = size + storedImageBytes(scene.files);
          }
        }
        if (Object.keys(patch).length === 0) break;
        setStatus({ kind: 'saving' });
        try {
          const saved = await saveBoard(id, patch, updatedAt.current);
          updatedAt.current = saved.updated_at;
          if (used !== null) setUsedBytes(used);
          if (!latest.current && pendingTitle.current === null) setStatus({ kind: 'saved' });
        } catch (e) {
          keepUnsaved();
          const tooLarge = e instanceof BoardsApiError && e.status === 413 && !isSceneTooLargeMessage(e.message);
          setStatus({ kind: 'error', reason: tooLarge ? SCENE_TOO_LARGE_MESSAGE : (e as Error).message });
          break;
        }
      } while (again.current || latest.current || pendingTitle.current !== null);
    } finally {
      inflight.current = false;
    }
  }, [id]);

  const schedule = useCallback(() => {
    setStatus((s) => (s.kind === 'error' && isSceneTooLargeMessage(s.reason) ? s : { kind: 'dirty' }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; flush(); }, AUTOSAVE_MS);
  }, [flush]);

  // Leaving the page: send whatever is still waiting on the debounce.
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; flush(); }
  }, [flush]);

  // Closing the tab with unsaved edits: the browser's own leave warning.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || inflight.current || latest.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const indicator = (() => {
    if (status.kind === 'saving' || status.kind === 'dirty') return { text: 'Saving...', color: 'var(--ink-3)' };
    if (status.kind === 'saved') return { text: 'Saved', color: '#4b7a4f' };
    if (status.kind === 'error') return { text: `Not saved: ${status.reason}`, color: '#b3261e' };
    return null;
  })();

  if (loadError) {
    return (
      <div style={{ width: '96%', maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
        <Link href="/boards" className="tap-44" style={{ font: "600 13px 'Inter Tight', sans-serif", color: '#024ADD', textDecoration: 'none' }}>&larr; Boards</Link>
        <div style={{
          marginTop: 12, background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
          padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
        }}>
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="board-editor">
      <div className="board-editor-bar">
        <Link href="/boards" className="tap-44 board-editor-back" style={{ font: "600 13px 'Inter Tight', sans-serif", color: '#024ADD', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          &larr; Boards
        </Link>
        <input
          value={title}
          disabled={!board}
          onChange={(e) => { setTitle(e.target.value); pendingTitle.current = e.target.value; schedule(); }}
          aria-label="Board title"
          className="board-editor-title"
          style={{
            boxSizing: 'border-box', font: "800 18px 'Archivo', sans-serif", color: '#111',
            letterSpacing: '-0.02em', border: 'none', outline: 'none', padding: '6px 0', background: 'transparent',
            textOverflow: 'ellipsis',
          }}
        />
        {indicator && (
          <span style={{ font: "500 12.5px 'Inter Tight', sans-serif", color: indicator.color, textAlign: 'right', minWidth: 0 }}>
            {indicator.text}
            {status.kind === 'error' && !isSceneTooLargeMessage(status.reason) && (
              <button
                onClick={() => flush()}
                style={{
                  marginLeft: 8, font: "700 13px 'Inter Tight', sans-serif", color: '#024ADD', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}
                className="tap-44"
              >
                Retry
              </button>
            )}
          </span>
        )}
        {usedBytes !== null && (
          <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {formatBytes(usedBytes)} used
          </span>
        )}
        {board && <ShareControl type="board" id={id} align="right" />}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {board ? (
          <ExcalidrawCanvas
            scene={board.scene}
            onChange={(elements, appState, files) => {
              latest.current = { elements, appState, files };
              schedule();
            }}
          />
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)',
          }}>
            Loading board...
          </div>
        )}
      </div>
    </div>
  );
}
