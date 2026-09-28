'use client';

// Reliable "download this text as a file" helper for both the internal
// skill page (SkillDetail) and the public share page (SharedView).
//
// Why this exists: a plain Blob + URL.createObjectURL + <a download> click
// is unreliable on mobile. iOS Safari in particular often opens a blob: URL
// in its own viewer/new tab instead of actually saving a file, regardless of
// the `download` attribute -- this is long-documented Safari behaviour, not
// a bug in this code (see WebKit bug 190351, and Safari's inconsistent
// `download` attribute support generally). Mobile Chrome can behave
// similarly depending on OS and file type.
//
// The fix (per current 2025/2026 guidance): prefer the Web Share API
// (Level 2, file sharing) when the browser says it can actually handle the
// file -- `navigator.canShare({ files })` is the correct feature-detection
// call, not a device/UA sniff. Where supported (iOS Safari 15+, Android
// Chrome, and some desktop browsers), this hands the file to the OS's native
// share sheet, which includes a real "Save to Files" / "Save to Downloads"
// action -- that's the actual fix for the mobile case. Everywhere else
// (desktop browsers without file-share support, older mobile browsers) it
// falls back to the classic Blob + anchor + click pattern, which already
// works fine on desktop.
//
// Sources checked before writing this:
// - MDN, Navigator.share(): user-gesture + secure-context requirements,
//   canShare({ files }) as the required feature-detection step before
//   calling share() with files.
//   https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
// - MDN, Navigator.canShare(): canShare returns false when "files are
//   specified but the implementation does not support file sharing" --
//   i.e. it's safe to call unconditionally and branch on the result.
//   https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare
// - WebKit bug 190351, "REGRESSION (Safari 12): Download of Blob URL
//   fails" -- confirms this is a known, long-standing Safari issue with
//   blob: URLs and the download attribute, not new.
//   https://bugs.webkit.org/show_bug.cgi?id=190351
// - Simon Neutert (2025), "Force iOS Safari (and other browsers) to
//   download media file" -- confirms the click must be synchronous inside
//   the real user-gesture handler (no setTimeout/await before the click),
//   and that iOS Safari's download-attribute handling is inconsistent by
//   file type. https://www.simon-neutert.de/2025/js-safari-media-download/
export async function downloadTextFile(filename: string, content: string, mimeType = 'text/markdown') {
  const file = new File([content], filename, { type: mimeType });

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // AbortError means the person opened the share sheet and cancelled --
      // that's a real choice, not a failure, so don't dump a surprise
      // classic download on them right after they said no.
      if (err instanceof Error && err.name === 'AbortError') return;
      // Any other failure (rare): fall through to the classic path below.
    }
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
