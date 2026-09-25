'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Excalidraw, getSceneVersion } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { parseScene } from '@/lib/boardScene';
import { installImageShrinkers } from '@/lib/boardImageIntercept';

type OnChange = NonNullable<React.ComponentProps<typeof Excalidraw>['onChange']>;

// Client-only (loaded through next/dynamic with ssr: false in BoardEditor).
// Fonts come from Excalidraw's default CDN (esm.run), per the package README;
// nothing is self-hosted.
//
// Excalidraw calls onChange on every pointer move, scroll and selection
// change. Only a change to the drawing itself or the background colour is
// passed up, and the first call (the initial load) is never a change.
export default function ExcalidrawCanvas({ scene, onChange }: {
  scene: unknown;
  onChange: OnChange;
}) {
  const initialData = useMemo(() => {
    const s = parseScene(scene);
    return { elements: s.elements, files: s.files, appState: s.appState } as unknown as ExcalidrawInitialDataState;
    // Loaded once per mount; later prop changes must not reset the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lastSig = useRef<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  // Big image files are shrunk before Excalidraw's own 4 MiB check sees them.
  useEffect(() => (wrapper.current ? installImageShrinkers(wrapper.current) : undefined), []);

  return (
    <div ref={wrapper} style={{ height: '100%', width: '100%' }}>
      <Excalidraw
        initialData={initialData}
        onChange={(elements, appState, files) => {
          const sig = `${getSceneVersion(elements)}|${appState.viewBackgroundColor}`;
          const first = lastSig.current === null;
          const changed = sig !== lastSig.current;
          lastSig.current = sig;
          if (!first && changed) onChange(elements, appState, files);
        }}
      />
    </div>
  );
}
