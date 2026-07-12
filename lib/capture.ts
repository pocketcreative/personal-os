import { serviceClient, USER_ID } from '@/lib/supabase';
import { classifyCapture, Classification } from '@/lib/ai/classify';
import { localDateKey } from '@/lib/dates';

export interface CaptureResult {
  captureId: string;
  routedTo: string;
  routedId: string | null;
  classification: Classification;
}

export async function processCapture(opts: {
  text: string;
  source: 'telegram' | 'web';
  audioUrl?: string | null;
}): Promise<CaptureResult[]> {
  const db = serviceClient();

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
        description: opts.text.trim() === classification.summary ? null : opts.text,
        key: classification.priority === 'today',
        category: classification.category,
        status: 'not_started',
        time_estimate_min: classification.time_estimate_min,
        tags: classification.tags,
      }).select('id').single();
      if (error) throw new Error(`task insert: ${error.message}`);
      routedId = data.id;
    } else if (classification.kind === 'journal') {
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

  return results;
}
