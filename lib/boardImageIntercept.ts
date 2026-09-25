'use client';
// Browser-only plumbing that shrinks big image files BEFORE Excalidraw sees
// them. Excalidraw 0.18.1 refuses any inserted image over 4 MiB and the limit
// is not a prop, so the file has to be replaced first.
//
//  - drop:   capture listener on the canvas wrapper, re-dispatches a drop
//  - paste:  capture listener on the canvas wrapper, re-dispatches a paste
//  - picker: Chrome's showOpenFilePicker is wrapped so getFile() returns the
//            shrunk file (Excalidraw's file dialog has no input element in the
//            DOM to listen on; browsers without showOpenFilePicker use a
//            detached input that cannot be intercepted, see the report).
//
// Files under the threshold are never touched. If a synthetic event cannot be
// built, the original event is left alone so Excalidraw shows its own error.
import { filesToPreShrink, shouldPreShrinkFile } from '@/lib/boardImages';
import { shrinkImageFile } from '@/lib/boardImagesClient';

// Marks the events this module re-dispatches, so they are not processed twice.
const REDISPATCHED = '__boardImagesRedispatched';

function isRedispatched(e: Event): boolean {
  return (e as unknown as Record<string, unknown>)[REDISPATCHED] === true;
}

function toDataTransfer(files: File[]): DataTransfer | null {
  try {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt.files.length === files.length ? dt : null;
  } catch {
    return null;
  }
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('input, textarea, [contenteditable="true"]');
}

// Shrinks the big files, keeps the rest in order. shrinkImageFile never throws.
function shrinkAll(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => (shouldPreShrinkFile(f) ? shrinkImageFile(f) : f)));
}

// Builds the event again with the given files, or null if this browser cannot.
type Rebuild = (files: File[]) => Event | null;

function rebuildDrop(orig: DragEvent): Rebuild {
  return (files) => {
    try {
      const dt = toDataTransfer(files);
      if (!dt) return null;
      const ev = new DragEvent('drop', {
        bubbles: true, cancelable: true, composed: true, dataTransfer: dt,
        clientX: orig.clientX, clientY: orig.clientY, screenX: orig.screenX, screenY: orig.screenY,
        ctrlKey: orig.ctrlKey, shiftKey: orig.shiftKey, altKey: orig.altKey, metaKey: orig.metaKey,
      });
      return ev.dataTransfer?.files.length === files.length ? ev : null;
    } catch {
      return null;
    }
  };
}

function rebuildPaste(): Rebuild {
  return (files) => {
    try {
      const dt = toDataTransfer(files);
      if (!dt) return null;
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: dt });
      return ev.clipboardData?.files.length === files.length ? ev : null;
    } catch {
      return null;
    }
  };
}

// Swaps an event carrying big images for one carrying shrunk copies.
// Decided synchronously (the original has to be stopped before any await):
// no big file, or no way to rebuild the event here, means the event passes
// through untouched.
function intercept(e: Event, files: FileList | null | undefined, rebuild: Rebuild): void {
  if (isRedispatched(e) || !files || filesToPreShrink(files).length === 0) return;
  const original = Array.from(files);
  const fallback = rebuild(original);
  if (!fallback) return;
  const target = e.target;
  e.stopImmediatePropagation();
  e.preventDefault();
  void (async () => {
    // A failure anywhere still delivers the user's original files.
    let out: Event = fallback;
    try {
      out = rebuild(await shrinkAll(original)) ?? fallback;
    } catch {
      out = fallback;
    }
    (out as unknown as Record<string, unknown>)[REDISPATCHED] = true;
    (target ?? document).dispatchEvent(out);
  })();
}

// Chrome/Edge open the image dialog with showOpenFilePicker and read each
// handle with getFile(). Wrap getFile on the returned handles.
function wrapFilePicker(): () => void {
  const w = window as unknown as { showOpenFilePicker?: (...args: unknown[]) => Promise<{ getFile: () => Promise<File> }[]> };
  const original = w.showOpenFilePicker;
  if (typeof original !== 'function') return () => {};
  const wrapped = async (...args: unknown[]) => {
    const handles = await original.apply(window, args);
    for (const handle of handles) {
      try {
        const getFile = handle.getFile.bind(handle);
        Object.defineProperty(handle, 'getFile', {
          configurable: true,
          value: async () => {
            const file = await getFile();
            return shouldPreShrinkFile(file) ? shrinkImageFile(file) : file;
          },
        });
      } catch { /* leave this handle as it is */ }
    }
    return handles;
  };
  w.showOpenFilePicker = wrapped;
  return () => { if (w.showOpenFilePicker === wrapped) w.showOpenFilePicker = original; };
}

// Returns the cleanup function.
export function installImageShrinkers(wrapper: HTMLElement): () => void {
  const onDrop = (e: Event) => intercept(e, (e as DragEvent).dataTransfer?.files, rebuildDrop(e as DragEvent));
  const onPaste = (e: Event) => {
    if (isTextField(e.target)) return;
    intercept(e, (e as ClipboardEvent).clipboardData?.files, rebuildPaste());
  };
  wrapper.addEventListener('drop', onDrop, true);
  wrapper.addEventListener('paste', onPaste, true);
  const unwrapPicker = wrapFilePicker();
  return () => {
    wrapper.removeEventListener('drop', onDrop, true);
    wrapper.removeEventListener('paste', onPaste, true);
    unwrapPicker();
  };
}
