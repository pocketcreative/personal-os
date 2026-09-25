'use client';
import { useMemo } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { parseScene } from '@/lib/boardScene';

// Client-only (loaded through next/dynamic with ssr: false), like
// ExcalidrawCanvas. View only: no editing, no onChange, nothing is saved.
export default function ExcalidrawViewer({ scene }: { scene: unknown }) {
  const initialData = useMemo(() => {
    const s = parseScene(scene);
    return { elements: s.elements, files: s.files, appState: s.appState, scrollToContent: true } as unknown as ExcalidrawInitialDataState;
    // Loaded once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Excalidraw
        initialData={initialData}
        viewModeEnabled
        handleKeyboardGlobally={false}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, clearCanvas: false } }}
      />
    </div>
  );
}
