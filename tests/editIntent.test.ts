import { describe, it, expect } from 'vitest';
import { parseEditIntent } from '@/lib/ai/editIntent';

const openTasks = [
  { id: '11111111-1111-1111-1111-111111111111', title: 'Look up SOP for client onboarding' },
  { id: '22222222-2222-2222-2222-222222222222', title: 'Build pre-workshop onboarding checklist for new clients' },
  { id: '33333333-3333-3333-3333-333333333333', title: 'Draft onboarding email for Client A' },
  { id: '44444444-4444-4444-4444-444444444444', title: 'Draft onboarding email for Client B' },
];

describe('parseEditIntent', () => {
  it('parses a clear single-match edit intent (status change)', () => {
    const raw = JSON.stringify({
      isEditIntent: true,
      match: 'single',
      taskId: openTasks[0].id,
      changes: { status: 'completed' },
    });
    const intent = parseEditIntent(raw, openTasks)!;
    expect(intent.isEditIntent).toBe(true);
    expect(intent.match).toBe('single');
    expect(intent.taskId).toBe(openTasks[0].id);
    expect(intent.changes?.status).toBe('completed');
  });

  it('parses a single-match priority change', () => {
    const raw = JSON.stringify({
      isEditIntent: true,
      match: 'single',
      taskId: openTasks[1].id,
      changes: { key: true },
    });
    const intent = parseEditIntent(raw, openTasks)!;
    expect(intent.match).toBe('single');
    expect(intent.changes?.key).toBe(true);
  });

  it('parses a single-match description append', () => {
    const raw = JSON.stringify({
      isEditIntent: true,
      match: 'single',
      taskId: openTasks[1].id,
      changes: { description: { action: 'append', text: 'needs OAuth setup and a sheets API key' } },
    });
    const intent = parseEditIntent(raw, openTasks)!;
    expect(intent.changes?.description).toEqual({ action: 'append', text: 'needs OAuth setup and a sheets API key' });
  });

  it('parses an ambiguous multi-candidate case', () => {
    const raw = JSON.stringify({
      isEditIntent: true,
      match: 'ambiguous',
      taskId: null,
      candidateTitles: [openTasks[2].title, openTasks[3].title],
    });
    const intent = parseEditIntent(raw, openTasks)!;
    expect(intent.isEditIntent).toBe(true);
    expect(intent.match).toBe('ambiguous');
    expect(intent.taskId).toBeNull();
    expect(intent.candidateTitles).toHaveLength(2);
  });

  it('parses a no-match case', () => {
    const raw = JSON.stringify({ isEditIntent: true, match: 'none', taskId: null });
    const intent = parseEditIntent(raw, openTasks)!;
    expect(intent.isEditIntent).toBe(true);
    expect(intent.match).toBe('none');
    expect(intent.taskId).toBeNull();
  });

  it('treats a message that does not look like an edit as isEditIntent:false, regardless of match field', () => {
    const raw = JSON.stringify({ isEditIntent: false, match: 'none', taskId: null });
    const intent = parseEditIntent(raw, openTasks)!;
    expect(intent.isEditIntent).toBe(false);
    expect(intent.match).toBe('none');
    expect(intent.taskId).toBeNull();
  });

  it('rejects a single match whose taskId is not in the open task list (hallucination guard)', () => {
    const raw = JSON.stringify({
      isEditIntent: true,
      match: 'single',
      taskId: 'not-a-real-id',
      changes: { status: 'completed' },
    });
    expect(parseEditIntent(raw, openTasks)).toBeNull();
  });

  it('rejects a single match with no valid changes', () => {
    const raw = JSON.stringify({ isEditIntent: true, match: 'single', taskId: openTasks[0].id, changes: {} });
    expect(parseEditIntent(raw, openTasks)).toBeNull();
  });

  it('rejects an ambiguous match with fewer than 2 candidates', () => {
    const raw = JSON.stringify({
      isEditIntent: true, match: 'ambiguous', taskId: null, candidateTitles: [openTasks[0].title],
    });
    expect(parseEditIntent(raw, openTasks)).toBeNull();
  });

  it('handles a malformed LLM response by returning null (fallback for caller)', () => {
    expect(parseEditIntent('not json at all', openTasks)).toBeNull();
    expect(parseEditIntent('{"foo":"bar"}', openTasks)).toBeNull();
    expect(parseEditIntent('{"isEditIntent":"yes"}', openTasks)).toBeNull();
    expect(parseEditIntent('{"isEditIntent":true,"match":"whenever"}', openTasks)).toBeNull();
  });

  it('validates status enum values and rejects invalid ones', () => {
    const raw = JSON.stringify({
      isEditIntent: true, match: 'single', taskId: openTasks[0].id,
      changes: { status: 'done_forever' },
    });
    // invalid status is dropped, leaving no valid changes -> null
    expect(parseEditIntent(raw, openTasks)).toBeNull();
  });

  it('accepts archived as a valid status (forward-looking for pending migration 0004)', () => {
    const raw = JSON.stringify({
      isEditIntent: true, match: 'single', taskId: openTasks[0].id,
      changes: { status: 'archived' },
    });
    const intent = parseEditIntent(raw, openTasks)!;
    expect(intent.changes?.status).toBe('archived');
  });

  it('validates category change', () => {
    const raw = JSON.stringify({
      isEditIntent: true, match: 'single', taskId: openTasks[0].id,
      changes: { category: 'personal' },
    });
    const intent = parseEditIntent(raw, openTasks)!;
    expect(intent.changes?.category).toBe('personal');
  });
});
