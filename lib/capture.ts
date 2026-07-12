import { serviceClient, USER_ID } from '@/lib/supabase';
import { classifyCapture, Classification } from '@/lib/ai/classify';
import { detectEditIntent, EditChanges } from '@/lib/ai/editIntent';
import { localDateKey } from '@/lib/dates';
import { STATUS_LABELS, CATEGORY_LABELS } from '@/lib/types';

export interface CaptureResult {
  captureId: string;
  routedTo: string;
  routedId: string | null;
  classification: Classification;
}

// processCapture used to always return CaptureResult[] (a new item was
// created). Now that it can also apply an edit to an EXISTING task, callers
// (the Telegram webhook and the web /api/capture route) need to distinguish
// "created N new items" from "edited one existing task" / "ambiguous match,
// needs clarification" / "no match, nothing was touched" — each needs its
// own reply, and silently forcing the latter three through the CaptureResult
// shape would either crash or misrepresent what happened.
export type CaptureOutcome =
  | { type: 'captured'; results: CaptureResult[] }
  | { type: 'edited'; taskId: string; title: string; summary: string; changes: EditChanges }
  | { type: 'ambiguous'; candidateTitles: string[] }
  | { type: 'no_match' };

function describeChanges(changes: EditChanges): string[] {
  const parts: string[] = [];
  if (changes.status) parts.push(`status → ${STATUS_LABELS[changes.status]}`);
  if (changes.key !== undefined) parts.push(`priority → ${changes.key ? 'Today' : 'Not today'}`);
  if (changes.category) parts.push(`category → ${CATEGORY_LABELS[changes.category]}`);
  if (changes.description) parts.push('description updated');
  return parts;
}

async function applyTaskEdit(opts: {
  db: ReturnType<typeof serviceClient>;
  taskId: string;
  changes: EditChanges;
  source: 'telegram' | 'web';
}): Promise<CaptureOutcome> {
  const { db, taskId, changes, source } = opts;

  // Need the current description to support "append" without clobbering
  // whatever's already there.
  const { data: current, error: curErr } = await db.from('tasks')
    .select('title, description').eq('id', taskId).eq('user_id', USER_ID).single();
  if (curErr) throw new Error(`task lookup for edit: ${curErr.message}`);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.status) {
    patch.status = changes.status;
    // Mirror app/api/tasks/[id]/route.ts's PATCH: completing/uncompleting via
    // status keeps completed_at in sync the same way the manual UI does.
    patch.completed_at = changes.status === 'completed' ? new Date().toISOString() : null;
  }
  if (changes.key !== undefined) patch.key = changes.key;
  if (changes.category) patch.category = changes.category;
  if (changes.description) {
    patch.description = changes.description.action === 'append' && current.description
      ? `${current.description}\n\n${changes.description.text}`
      : changes.description.text;
  }

  const { data: updated, error } = await db.from('tasks').update(patch)
    .eq('id', taskId).eq('user_id', USER_ID).select('title').single();
  // Thrown (not swallowed) — e.g. an 'archived' status write will violate the
  // CHECK constraint until migration 0004_task_archived_status.sql is applied.
  // The webhook's outer try/catch turns this into a "⚠️ Capture failed: ..."
  // reply rather than a crash, and — critically — nothing was applied, so
  // there's no risk of a half-applied edit.
  if (error) throw new Error(`task edit: ${error.message}`);

  const { error: auditErr } = await db.from('audit_log').insert({
    user_id: USER_ID, action: 'edit', resource_type: 'tasks', resource_id: taskId,
    metadata: { source, changes },
  });
  if (auditErr) console.error('audit insert failed', auditErr.message);

  return { type: 'edited', taskId, title: updated.title, summary: describeChanges(changes).join(', '), changes };
}

export async function processCapture(opts: {
  text: string;
  source: 'telegram' | 'web';
  audioUrl?: string | null;
}): Promise<CaptureOutcome> {
  const db = serviceClient();

  // Before treating this message as a brand-new capture, check whether it's
  // actually an instruction to edit one of the user's existing open tasks
  // ("mark X as done", "archive Y", ...). Only not_started/in_progress tasks
  // are reasonable edit targets — completed/archived ones aren't what anyone
  // means by "the X task" in casual conversation.
  const { data: openTaskRows, error: openTasksErr } = await db.from('tasks')
    .select('id, title').eq('user_id', USER_ID).in('status', ['not_started', 'in_progress']);
  if (openTasksErr) console.error('open tasks fetch failed', openTasksErr.message);
  const openTasks = openTaskRows ?? [];

  const editIntent = await detectEditIntent(opts.text, openTasks);
  if (editIntent.isEditIntent) {
    if (editIntent.match === 'single' && editIntent.taskId && editIntent.changes) {
      return applyTaskEdit({ db, taskId: editIntent.taskId, changes: editIntent.changes, source: opts.source });
    }
    if (editIntent.match === 'ambiguous') {
      return { type: 'ambiguous', candidateTitles: editIntent.candidateTitles ?? [] };
    }
    // match === 'none' (or single without valid changes, which shouldn't
    // happen given parseEditIntent's validation, but fails safe here too)
    return { type: 'no_match' };
  }

  // Feed the classifier the user's recent corrections so it converges on their judgment.
  const { data: overrideRows, error: ovErr } = await db
    .from('raw_captures')
    .select('classification, override')
    .eq('user_id', USER_ID)
    .not('override', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (ovErr) console.error('override fetch failed', ovErr.message);
  const overrides = (overrideRows ?? []).map((r) =>
    JSON.stringify({ was: r.classification, corrected: r.override }),
  );

  const { classifications, llm_source } = await classifyCapture(opts.text, overrides);

  const results: CaptureResult[] = [];
  // Avoids duplicating opts.text if a single capture yields 2+ journal items:
  // once this capture has appended/inserted its text into today's entry, later
  // journal-kind items from the same loop just reuse that entry's id instead
  // of appending the identical opts.text again.
  let journalEntryIdThisCapture: string | null = null;

  // Sequential (not parallel) so that multiple journal items in one message
  // correctly append onto the same day's entry in order, rather than racing
  // on the "does today's entry exist yet" check.
  for (const classification of classifications) {
    const routedTo =
      classification.kind === 'task' ? 'tasks'
      : classification.kind === 'journal' ? 'journal_entries'
      : 'goals';
    let routedId: string | null = null;

    if (classification.kind === 'task') {
      const { data, error } = await db.from('tasks').insert({
        user_id: USER_ID,
        title: classification.summary,
        description: classification.description_points.length > 0
          ? classification.description_points.map((p) => `• ${p}`).join('\n')
          : null,
        key: classification.priority === 'today',
        category: classification.category,
        status: 'not_started',
        time_estimate_min: classification.time_estimate_min,
        tags: classification.tags,
      }).select('id').single();
      if (error) throw new Error(`task insert: ${error.message}`);
      routedId = data.id;
    } else if (classification.kind === 'journal') {
      if (journalEntryIdThisCapture) {
        // Already appended/inserted this capture's text into today's entry
        // once (from an earlier journal-kind item in this same loop) — reuse
        // that same entry id rather than appending the identical opts.text again.
        routedId = journalEntryIdThisCapture;
      } else {
        const entryDate = localDateKey();
        const { data: existing, error: exErr } = await db.from('journal_entries')
          .select('id, raw_text').eq('user_id', USER_ID).eq('entry_date', entryDate).maybeSingle();
        if (exErr) throw new Error(`journal lookup: ${exErr.message}`);
        if (existing) {
          const { error } = await db.from('journal_entries')
            .update({ raw_text: `${existing.raw_text}\n\n${opts.text}`.trim() })
            .eq('id', existing.id);
          if (error) throw new Error(`journal update: ${error.message}`);
          routedId = existing.id;
        } else {
          const { data, error } = await db.from('journal_entries')
            .insert({ user_id: USER_ID, entry_date: entryDate, raw_text: opts.text })
            .select('id').single();
          if (error) throw new Error(`journal insert: ${error.message}`);
          routedId = data.id;
        }
        journalEntryIdThisCapture = routedId;
      }
    } else {
      const scope = classification.priority === 'today' ? 'week' : 'month';
      const { data, error } = await db.from('goals')
        .insert({ user_id: USER_ID, scope, title: classification.summary })
        .select('id').single();
      if (error) throw new Error(`goal insert: ${error.message}`);
      routedId = data.id;
    }

    // Not wrapped in a transaction with the routing insert above — Supabase's
    // JS client has no multi-statement transaction support without a custom
    // RPC. A crash between the two inserts could orphan a task/journal/goal
    // row with no raw_captures audit trail. Acceptable risk for a single-user
    // P0/P1 system on one low-latency region; revisit via a Postgres RPC if
    // this ever needs hard atomicity guarantees.
    const { data: capture, error: capErr } = await db.from('raw_captures').insert({
      user_id: USER_ID,
      source: opts.source,
      raw_text: opts.text,
      audio_url: opts.audioUrl ?? null,
      classification,
      llm_source,
      routed_to: routedTo,
      routed_id: routedId,
    }).select('id').single();
    if (capErr) throw new Error(`capture insert: ${capErr.message}`);

    // audit_log is a best-effort admin ledger, not the source of truth (that's
    // raw_captures above) — a failure here shouldn't cost the user their
    // capture, so this soft-fails intentionally rather than throwing.
    const { error: auditErr } = await db.from('audit_log').insert({
      user_id: USER_ID, action: 'capture', resource_type: routedTo, resource_id: routedId,
      metadata: { source: opts.source, llm_source },
    });
    if (auditErr) console.error('audit insert failed', auditErr.message);

    results.push({ captureId: capture.id, routedTo, routedId, classification });
  }

  return { type: 'captured', results };
}
