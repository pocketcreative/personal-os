import { DEFAULT_POST_TIME, STAGE_OPTIONS, STATUS_OPTIONS, type ContentItem, type ContentItemType, type ZernioPostRef } from '@/lib/types';
import { cancelZernioPosts, rescheduleZernioPosts, scheduleToZernio } from '@/lib/zernio';

// Shared by both the create (POST /api/content-items) and update
// (PATCH /api/content-items/[id]) paths, so a bad Stage/Status value comes
// back as one clean 400 naming the field in both places, matching the DB
// check constraints in migration 0034 exactly (read live off Notion, not
// invented -- see that migration's header comment).
export function invalidStageOrStatus(type: ContentItemType, stage?: string, status?: string | null): string | null {
  if (stage !== undefined && !STAGE_OPTIONS[type].includes(stage)) {
    return `stage must be one of: ${STAGE_OPTIONS[type].join(', ')}`;
  }
  if (status !== undefined && status !== null && !STATUS_OPTIONS[type].includes(status)) {
    return `status must be one of: ${STATUS_OPTIONS[type].join(', ')}`;
  }
  return null;
}

// Real two-way Zernio sync (decision 6): called from PATCH /api/content-items/[id]
// whenever a patch touches stage/post_date/platforms/caption. Deliberately
// gated on Stage === 'Scheduled' (not just "any Post Date set") -- dragging a
// draft onto the calendar to plan it should not push it live to Instagram;
// moving/keeping it in the Scheduled column with a date and a platform is the
// actual "yes, post this" signal, matching decision 3 ("Scheduled means
// posted"). This is a deliberate safety choice, not a limitation of the
// Zernio API itself -- flagged in the Phase 1 report for Brendan to confirm
// or loosen.
export async function syncZernioForPatch(
  current: ContentItem,
  next: { stage: string; post_date: string | null; post_time: string | null; platforms: string[]; caption: string | null; name: string },
): Promise<ZernioPostRef[]> {
  const wasScheduled = current.stage === 'Scheduled';
  const isScheduled = next.stage === 'Scheduled';
  const existingLive = current.zernio_post_ids.filter((r) => r.status === 'scheduled');

  // Left the Scheduled stage (or lost its date/platforms) -- cancel whatever
  // was actually live in Zernio and clear the refs.
  if (!isScheduled || !next.post_date || next.platforms.length === 0) {
    if (existingLive.length > 0) await cancelZernioPosts(existingLive);
    return wasScheduled ? [] : current.zernio_post_ids;
  }

  // The real time Brendan picked in the UI (post_time) is what actually gets
  // sent to Zernio -- falls back to DEFAULT_POST_TIME only when he hasn't
  // chosen one, same default this always used, just named now instead of a
  // magic string.
  const timeHHMM = (next.post_time ?? DEFAULT_POST_TIME).slice(0, 5);
  const scheduledForISO = `${next.post_date}T${timeHHMM}:00`;
  const platformsChanged = JSON.stringify([...next.platforms].sort()) !== JSON.stringify([...current.platforms].sort());
  const dateChanged = current.post_date !== next.post_date || current.post_time !== next.post_time;
  const contentChanged = (current.caption ?? current.name) !== (next.caption ?? next.name);

  // Newly entering Scheduled (or platforms changed, which needs a fresh
  // create since Zernio's reschedule endpoint can't add/remove platforms on
  // an existing post): create fresh, cancelling any stale refs first.
  if (!wasScheduled || existingLive.length === 0 || platformsChanged) {
    if (existingLive.length > 0) await cancelZernioPosts(existingLive);
    return scheduleToZernio({ content: next.caption || next.name, platforms: next.platforms, scheduledForISO });
  }

  // Already scheduled, same platforms -- just reschedule/update the existing
  // Zernio posts if the date or content actually changed.
  if (dateChanged || contentChanged) {
    return rescheduleZernioPosts(existingLive, scheduledForISO, next.caption || next.name);
  }
  return current.zernio_post_ids;
}
