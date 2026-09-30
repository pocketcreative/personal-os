// Shared Drive-video URL helpers. Same logic as ContentDetailModal.tsx's
// private helpers of the same name, pulled out here so the new item detail
// page (components/media/ItemDetail.tsx) can use the exact same Drive-link
// handling without duplicating it a third time or risking a change to the
// already-shipped ContentDetailModal.

export function driveFileId(link: string): string | null {
  const match = link.match(/\/file\/d\/([^/]+)\//);
  return match ? match[1] : null;
}

export function driveViewUrl(link: string): string {
  const id = driveFileId(link);
  return id ? `https://drive.google.com/file/d/${id}/view` : link;
}

export function streamSrc(link: string): string {
  const id = driveFileId(link);
  return id ? `/api/media/${id}/stream` : link;
}
