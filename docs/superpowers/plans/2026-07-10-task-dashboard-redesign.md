# Task Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tasks page's List/Kanban/Smart-view system with a single high-fidelity redesign (desktop table + mobile card, pixel-close to the provided design handoff), with per-task independent timers, category/status fields, and binary priority.

**Architecture:** New migration adds `category`/`status` columns and a per-task timer uniqueness constraint. `lib/ai/classify.ts` and `lib/capture.ts` are updated to the new field surface. Kanban, the daily rerank cron, and the global `TimerStrip` are deleted. A new `useTaskDashboard()` hook is the single state owner for two new view components (`TaskBoardDesktop`, `TaskBoardMobile`) picked by a `useMediaQuery` breakpoint, both consuming shared `ClockInput`/`FieldPopover`/detail-modal primitives.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4 (inline styles for this feature per the design's exact token values), Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-10-task-dashboard-redesign.md`
**Design reference (read-only, do not modify):** `~/Downloads/design_handoff_task_dashboard/README.md`, `Task Dashboard.dc.html`, `Task Dashboard Mobile.dc.html`

**Testing discipline for every task below (non-negotiable — this project's established bar):**
- Every pure-logic function (parsing, sorting, classification) gets a TDD test written FIRST, confirmed failing, then implementation, then confirmed passing.
- Every DB-touching change gets live-verified against the real Supabase project (credentials in `.env.local`) with real rows created, the behavior actually observed, then ALL test data deleted and re-confirmed empty via direct table queries. Never claim "done" without this.
- `npm run build` and `npm test` must both pass before any commit.
- Never run `npm run dev` in the foreground — background it, verify, kill it.

---

## Phase A — Data model + timer backend

### Task 1: Migration 0003 — category, status, per-task timer constraint

**Files:**
- Create: `supabase/migrations/0003_task_dashboard_redesign.sql`

- [ ] **Step 1: Create the migration file**

```sql
alter table tasks
  add column category text not null default 'personal'
    check (category in ('personal', 'business')),
  add column status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed'));

-- Backfill: tasks already marked done via completed_at should read as
-- completed, not fall back to the new column's 'not_started' default.
update tasks set status = 'completed' where completed_at is not null;

-- Per-task (not per-user) one-open-session guarantee: a single task can't
-- have two overlapping timer sessions, but different tasks can each run
-- independently now that the one-timer-max-app-wide invariant is retired.
create unique index timer_sessions_one_open_per_task_idx
  on timer_sessions (task_id)
  where ended_at is null;
```

- [ ] **Step 2: Ask the user to apply it (cannot be applied programmatically — no raw DB write access)**

Print the SQL directly in chat (same pattern as migrations 0001/0002) and ask the user to paste it into Supabase SQL Editor → Run. Do not proceed to live-verification steps in later tasks until this is confirmed applied — if the user is unavailable, implement and unit-test everything that doesn't require the new columns/index live, and clearly flag in your report which live-verification steps are blocked pending migration application.

- [ ] **Step 3: Once applied, verify via REST API**

```bash
source /Users/brendanang/Documents/personal-os/.env.local
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/tasks?select=id,category,status&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: `200` with `category`/`status` fields present in the response shape (empty array `[]` is fine if no tasks exist — the important thing is no `column does not exist` error).

- [ ] **Step 4: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add supabase/migrations/0003_task_dashboard_redesign.sql
git commit -m "feat: migration 0003 — category, status, per-task timer constraint"
```

---

### Task 2: Per-task timer helpers (TDD)

**Files:**
- Modify: `lib/timers.ts`
- Test: `tests/timers.test.ts`

- [ ] **Step 1: Read the current `tests/timers.test.ts`** — it already has `sumSessionMinutes` tests (Task 16 of the original plan). Keep those; add new tests below for the per-task close function.

- [ ] **Step 2: Add the failing tests** (append to `tests/timers.test.ts`)

```ts
import { closeOpenSessionForTask } from '@/lib/timers';

describe('closeOpenSessionForTask (integration shape check)', () => {
  it('is exported as a function', () => {
    expect(typeof closeOpenSessionForTask).toBe('function');
  });
});
```

(This is a thin smoke test — `closeOpenSessionForTask` itself is a DB-touching function with a `SupabaseClient` parameter, so its real behavior is verified live in Task 3, not unit-tested with a mock. The existing `sumSessionMinutes` tests already cover the pure rollup math this function depends on.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- timers`
Expected: FAIL — `closeOpenSessionForTask` is not exported

- [ ] **Step 4: Replace `closeOpenSessions` with a per-task version in `lib/timers.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { USER_ID } from '@/lib/supabase';

export interface SessionLike {
  started_at: string;
  ended_at: string | null;
}

export function sumSessionMinutes(sessions: SessionLike[], now: Date = new Date()): number {
  const ms = sessions.reduce((acc, s) => {
    const end = s.ended_at ? new Date(s.ended_at) : now;
    return acc + Math.max(0, end.getTime() - new Date(s.started_at).getTime());
  }, 0);
  return Math.round(ms / 60_000);
}

/** Recompute a task's actual_time_min from its closed sessions. */
export async function rollupTask(db: SupabaseClient, taskId: string): Promise<void> {
  const { data: sessions, error } = await db.from('timer_sessions')
    .select('started_at, ended_at').eq('task_id', taskId).not('ended_at', 'is', null);
  if (error) throw new Error(error.message);
  const { error: upErr } = await db.from('tasks')
    .update({ actual_time_min: sumSessionMinutes(sessions ?? []), updated_at: new Date().toISOString() })
    .eq('id', taskId);
  if (upErr) throw new Error(upErr.message);
}

/**
 * Close THIS task's open session (if any) and roll it up. Scoped per-task,
 * not per-user — multiple different tasks can each have their own running
 * timer simultaneously (the app-wide one-timer-max invariant was retired
 * in the Task Dashboard redesign; a task still can't have two overlapping
 * sessions with itself, enforced by migrations/0003's partial unique index).
 *
 * IMPORTANT: never insert into timer_sessions from anywhere except
 * app/api/timers/start/route.ts, which always calls this first for the
 * SAME task_id. Bypassing it would let a task accumulate two open sessions
 * at once and violate the DB constraint on the next start attempt.
 */
export async function closeOpenSessionForTask(db: SupabaseClient, taskId: string): Promise<void> {
  const { data: open, error } = await db.from('timer_sessions')
    .select('id').eq('task_id', taskId).eq('user_id', USER_ID).is('ended_at', null);
  if (error) throw new Error(error.message);
  for (const s of open ?? []) {
    const { error: endErr } = await db.from('timer_sessions')
      .update({ ended_at: new Date().toISOString() }).eq('id', s.id);
    if (endErr) throw new Error(endErr.message);
  }
  if (open && open.length > 0) await rollupTask(db, taskId);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- timers`
Expected: all pass (existing `sumSessionMinutes` tests + new smoke test)

- [ ] **Step 6: Commit**

```bash
git add lib/timers.ts tests/timers.test.ts
git commit -m "feat: per-task timer close/rollup, replacing app-wide one-timer-max"
```

---

### Task 3: Per-task timer API routes

**Files:**
- Modify: `app/api/timers/start/route.ts`, `app/api/timers/stop/route.ts`
- Delete: `app/api/timers/active/route.ts` (superseded — Task 8 embeds active-session state directly in `GET /api/tasks`)

- [ ] **Step 1: Rewrite `app/api/timers/start/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { closeOpenSessionForTask } from '@/lib/timers';

const UNIQUE_VIOLATION = '23505';

export async function POST(req: NextRequest) {
  const { task_id } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  const db = serviceClient();
  try {
    // Close only THIS task's own stale open session (e.g. a page refresh
    // left one dangling) — does not touch other tasks' running timers.
    await closeOpenSessionForTask(db, task_id);
    let { data, error } = await db.from('timer_sessions')
      .insert({ user_id: USER_ID, task_id }).select('*').single();
    if (error?.code === UNIQUE_VIOLATION) {
      await closeOpenSessionForTask(db, task_id);
      ({ data, error } = await db.from('timer_sessions')
        .insert({ user_id: USER_ID, task_id }).select('*').single());
    }
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('timer start failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Rewrite `app/api/timers/stop/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { closeOpenSessionForTask } from '@/lib/timers';

export async function POST(req: NextRequest) {
  const { task_id } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  const db = serviceClient();
  try {
    await closeOpenSessionForTask(db, task_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('timer stop failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Delete `app/api/timers/active/route.ts`**

```bash
rm /Users/brendanang/Documents/personal-os/app/api/timers/active/route.ts
```

- [ ] **Step 4: Verify `npm run build` succeeds** (expect the route to disappear from the route list, no errors about the deleted file)

- [ ] **Step 5: Live verification** (skip and flag if migration 0003 not yet applied — this needs the per-task unique index)

Background the dev server, create two temp tasks via `x-api-secret`, start a timer on each independently, confirm BOTH show as running simultaneously (query `timer_sessions` directly — two rows with `ended_at is null`, different `task_id`), stop one, confirm only that one closed and rolled up while the other keeps running, stop the second, confirm both closed. Delete both temp tasks (cascades their sessions), confirm `tasks` and `timer_sessions` both empty afterward, kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add app/api/timers/start/route.ts app/api/timers/stop/route.ts
git rm app/api/timers/active/route.ts
git commit -m "feat: per-task timer start/stop API, remove global active-timer route"
```

---

### Task 4: `Task` type — add category/status, drop urgency-for-UI reliance

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Rewrite `lib/types.ts`**

```ts
export interface ActiveTimerSession {
  id: string;
  started_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  urgency: 'today' | 'this_week' | 'this_month' | 'someday'; // legacy, unused by the new UI
  key: boolean; // reused as the new binary priority: true = "TODAY"
  category: 'personal' | 'business';
  status: 'not_started' | 'in_progress' | 'completed';
  priority_score: number; // legacy, unused by the new UI
  rank_pinned: boolean; // legacy, unused by the new UI
  time_estimate_min: number | null;
  actual_time_min: number;
  tags: string[];
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  active_timer: ActiveTimerSession | null;
}

export const CATEGORIES = ['personal', 'business'] as const;
export const CATEGORY_LABELS: Record<Task['category'], string> = {
  personal: 'Personal', business: 'Business',
};

export const STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export const STATUS_LABELS: Record<Task['status'], string> = {
  not_started: 'Not started', in_progress: 'In progress', completed: 'Completed',
};

// Legacy — kept only because components/tasks/TaskRow.tsx (used by the
// unchanged SmartView, per this redesign's decision to leave Smart search
// as-is) still references these. Not used by anything in the new Board UI.
export const URGENCIES = ['today', 'this_week', 'this_month', 'someday'] as const;
export const URGENCY_LABELS: Record<Task['urgency'], string> = {
  today: 'Today', this_week: 'This Week', this_month: 'This Month', someday: 'Someday',
};
```

- [ ] **Step 2: Verify `npm run build` still succeeds.** This change is purely additive (`category`/`status`/`active_timer` added, nothing removed — `URGENCY_LABELS`/`URGENCIES` are kept specifically so `TaskRow.tsx`/`SmartView.tsx` keep compiling unchanged), so the build should stay clean with no new errors. If you see errors referencing `TaskBoard.tsx`, `TaskDrawer.tsx`, or `KanbanView.tsx`, they're pre-existing files slated for deletion in Task 21 — do not attempt to fix them, just confirm the error isn't something Task 4 itself introduced.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: Task type — category, status, active_timer; mark urgency/priority_score/rank_pinned legacy"
```

---

### Task 5: `GET /api/tasks` — add `?status=all` mode, embed active timer

**Files:**
- Modify: `app/api/tasks/route.ts`

- [ ] **Step 1: Rewrite the `GET` handler**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? 'open';
  const db = serviceClient();
  let q = db.from('tasks')
    .select('*, active_timer:timer_sessions!left(id, started_at)')
    .eq('user_id', USER_ID)
    // A task can have at most one row in timer_sessions with ended_at null
    // (enforced by migrations/0003's partial unique index), so this embed
    // is safe to treat as at-most-one even though PostgREST always returns
    // an array for a to-many embed — flattened to a single object below.
    .order('created_at', { ascending: false })
    .limit(100000 + (Date.now() % 100000)); // unique limit busts PostgREST edge cache
  if (status === 'done') q = q.not('completed_at', 'is', null);
  else if (status === 'open') q = q.is('completed_at', null);
  // status === 'all': no filter — used by the new Task Dashboard, which
  // keeps completed tasks visible (sorted last) rather than hiding them.
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const withFlattenedTimer = (data ?? []).map((t) => {
    const sessions = Array.isArray(t.active_timer) ? t.active_timer : [];
    const openSession = sessions.find((s: { id: string; started_at: string }) => s) ?? null;
    return { ...t, active_timer: openSession };
  });
  return NextResponse.json(withFlattenedTimer, { headers: { 'cache-control': 'no-store' } });
}
```

Note: the embed `timer_sessions!left(id, started_at)` returns ALL sessions for the task by default (open and closed) unless filtered. Since we only want the currently-open one, and PostgREST embeds don't support inline `where ended_at is null` in the select string reliably across versions, do this filtering defensively in Step 1's `.find()` — but this only works correctly if there's normally zero-or-one row total per task in practice. **This is a known simplification** — if a task has closed sessions AND we haven't filtered them out of the embed, `active_timer` could incorrectly show a closed session. Fix this properly: change the embed's foreign key hint to filter server-side. Use this corrected version instead:

```ts
  let q = db.from('tasks')
    .select('*, timer_sessions(id, started_at, ended_at)')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(100000 + (Date.now() % 100000));
  if (status === 'done') q = q.not('completed_at', 'is', null);
  else if (status === 'open') q = q.is('completed_at', null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const withFlattenedTimer = (data ?? []).map((t) => {
    const sessions = (t.timer_sessions ?? []) as { id: string; started_at: string; ended_at: string | null }[];
    const openSession = sessions.find((s) => s.ended_at === null) ?? null;
    const { timer_sessions: _drop, ...rest } = t;
    return { ...rest, active_timer: openSession ? { id: openSession.id, started_at: openSession.started_at } : null };
  });
```

Use this corrected version as the actual implementation (fetch all sessions per task, filter client-side for the open one, strip the raw `timer_sessions` array from the response so it matches the `Task` type from Task 4 exactly).

- [ ] **Step 2: Verify `npm run build` succeeds**

- [ ] **Step 3: Live verification**

Background dev server. Create a temp task via `x-api-secret`. `GET /api/tasks?status=all` → confirm it appears with `active_timer: null`. Start a timer on it directly via `POST /api/timers/start`. `GET /api/tasks?status=all` again → confirm `active_timer` is now `{id, started_at}` matching the session just created. Stop the timer. `GET /api/tasks?status=all` → confirm `active_timer` is `null` again. Delete the temp task (cascades the session). Re-query `tasks` and `timer_sessions`, confirm both empty. Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add app/api/tasks/route.ts
git commit -m "feat: GET /api/tasks — status=all mode, embed each task's active timer session"
```

---

### Task 6: `PATCH /api/tasks/[id]` — allow category/status

**Files:**
- Modify: `app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Read the current file, extend `PATCHABLE`**

```ts
const PATCHABLE = new Set([
  'title', 'description', 'urgency', 'key', 'priority_score', 'rank_pinned',
  'time_estimate_min', 'actual_time_min', 'tags', 'due_date', 'completed_at',
  'category', 'status',
]);
```

Also add: when `patch.status === 'completed'`, auto-set `patch.completed_at = new Date().toISOString()` if not already present in the patch (mirrors the design's "marking Completed via the status popover also completes the task" behavior — the caller only sends `{status: 'completed'}`, not `completed_at` explicitly). When `patch.status` is set to anything OTHER than `'completed'` and `completed_at` isn't explicitly in the patch, clear it (`patch.completed_at = null`) — so un-completing a task via the status popover un-marks it too. Insert this logic right after the existing `rank_pinned` auto-pin logic, before `patch.updated_at = ...`:

```ts
  if ('status' in patch && !('completed_at' in patch)) {
    patch.completed_at = patch.status === 'completed' ? new Date().toISOString() : null;
  }
```

- [ ] **Step 2: Verify `npm run build` succeeds**

- [ ] **Step 3: Live verification**

Create a temp task. `PATCH {status: 'completed'}` → confirm response has both `status: 'completed'` AND `completed_at` set to a real timestamp. `PATCH {status: 'not_started'}` → confirm `completed_at` is now `null`. `PATCH {category: 'business'}` → confirm it persists. Delete the temp task, confirm `tasks` empty.

- [ ] **Step 4: Commit**

```bash
git add app/api/tasks/[id]/route.ts
git commit -m "feat: PATCH /api/tasks/[id] — allow category/status, sync completed_at"
```

---

## Phase B — Classifier + capture pipeline

### Task 7: Classifier — category + binary priority (TDD)

**Files:**
- Modify: `lib/ai/classify.ts`
- Test: `tests/classify.test.ts`

- [ ] **Step 1: Read the current `tests/classify.test.ts`, rewrite it for the new field surface**

```ts
import { describe, it, expect } from 'vitest';
import { parseClassification, regexClassify } from '@/lib/ai/classify';

describe('parseClassification', () => {
  it('parses valid JSON, even wrapped in prose', () => {
    const raw = 'Here you go: {"kind":"task","priority":"today","category":"business","tags":["content"],"summary":"Film reel","time_estimate_min":45}';
    const c = parseClassification(raw)!;
    expect(c.kind).toBe('task');
    expect(c.priority).toBe('today');
    expect(c.category).toBe('business');
    expect(c.time_estimate_min).toBe(45);
    expect(c.low_confidence).toBe(false);
  });
  it('rejects invalid enums and empty summaries', () => {
    expect(parseClassification('{"kind":"meal","priority":"today","category":"personal","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","priority":"whenever","category":"personal","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","priority":"today","category":"hobby","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","priority":"today","category":"personal","summary":""}')).toBeNull();
    expect(parseClassification('not json')).toBeNull();
  });
  it('defaults category to personal when the model omits it', () => {
    const raw = '{"kind":"task","priority":"today","summary":"x"}';
    const c = parseClassification(raw)!;
    expect(c.category).toBe('personal');
  });
});

describe('regexClassify', () => {
  it('flags low confidence and defaults to task/dash/personal', () => {
    const c = regexClassify('send the proposal to the client');
    expect(c.kind).toBe('task');
    expect(c.priority).toBe('dash');
    expect(c.category).toBe('personal');
    expect(c.low_confidence).toBe(true);
  });
  it('detects today priority, journal kind, and business category', () => {
    expect(regexClassify('need to do this today asap').priority).toBe('today');
    expect(regexClassify('journal: today went well, felt focused').kind).toBe('journal');
    expect(regexClassify('email the client about the invoice').category).toBe('business');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- classify`
Expected: FAIL — `c.priority`/`c.category` undefined, old `urgency` field shape mismatch

- [ ] **Step 3: Rewrite `lib/ai/classify.ts`**

```ts
import { requireEnv } from '@/lib/auth';

export type CaptureKind = 'task' | 'journal' | 'goal';
export type Priority = 'today' | 'dash';
export type Category = 'personal' | 'business';

export interface Classification {
  kind: CaptureKind;
  priority: Priority;
  category: Category;
  tags: string[];
  summary: string;
  time_estimate_min: number | null;
  low_confidence: boolean;
}

const KINDS: CaptureKind[] = ['task', 'journal', 'goal'];
const PRIORITIES: Priority[] = ['today', 'dash'];
const CATEGORIES: Category[] = ['personal', 'business'];

const SYSTEM_PROMPT = `You classify one captured note from the user's phone into strict JSON.
Return ONLY a JSON object:
{"kind":"task"|"journal"|"goal","priority":"today"|"dash","category":"personal"|"business","tags":string[] (1-3 lowercase words),"summary":string (imperative, <=80 chars),"time_estimate_min":number|null}
- "task" = a single actionable item. "journal" = reflection/diary about the day. "goal" = an outcome for the week/month, not one action.
- priority: "today" only if the note implies urgency/today, otherwise "dash".
- category: "business" for work/client/professional items, "personal" for everything else.
- time_estimate_min: honest working-time estimate for tasks (the user has ADHD and underestimates); null for journal/goal.
- Recent corrections the user made to past classifications are provided — match their judgment.`;

export function parseClassification(raw: string): Classification | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (!KINDS.includes(obj.kind) || !PRIORITIES.includes(obj.priority)) return null;
    if (obj.category !== undefined && !CATEGORIES.includes(obj.category)) return null;
    if (typeof obj.summary !== 'string' || !obj.summary.trim()) return null;
    return {
      kind: obj.kind,
      priority: obj.priority,
      category: CATEGORIES.includes(obj.category) ? obj.category : 'personal',
      tags: Array.isArray(obj.tags) ? obj.tags.filter((t: unknown): t is string => typeof t === 'string').slice(0, 3) : [],
      summary: obj.summary.trim().slice(0, 120),
      time_estimate_min: typeof obj.time_estimate_min === 'number' ? Math.round(obj.time_estimate_min) : null,
      low_confidence: false,
    };
  } catch {
    return null;
  }
}

export function regexClassify(text: string): Classification {
  const lower = text.toLowerCase();
  const kind: CaptureKind =
    /\b(journal|diary|reflect(ing|ion)?|felt|grateful)\b/.test(lower) ? 'journal'
    : /\b(goal|this month i want|by end of)\b/.test(lower) ? 'goal'
    : 'task';
  const priority: Priority =
    /\b(today|tonight|asap|right now|urgent)\b/.test(lower) ? 'today' : 'dash';
  const category: Category =
    /\b(client|invoice|proposal|meeting|colleague|boss|work|email|deadline)\b/.test(lower) ? 'business' : 'personal';
  return {
    kind, priority, category, tags: [],
    summary: text.trim().slice(0, 120),
    time_estimate_min: null,
    low_confidence: true,
  };
}

function userContent(text: string, overrides: string[]): string {
  return `Recent corrections (was → corrected):\n${overrides.join('\n') || '(none)'}\n\nNote:\n${text}`;
}

const PROVIDER_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function claudeClassify(text: string, overrides: string[]): Promise<Classification | null> {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': requireEnv('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent(text, overrides) }],
    }),
  });
  if (!res.ok) {
    console.error('anthropic classify failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return parseClassification(json.content?.[0]?.text ?? '');
}

async function openaiClassify(text: string, overrides: string[]): Promise<Classification | null> {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CLASSIFIER_MODEL ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent(text, overrides) },
      ],
    }),
  });
  if (!res.ok) {
    console.error('openai classify failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return parseClassification(json.choices?.[0]?.message?.content ?? '');
}

export async function classifyCapture(
  text: string, overrides: string[],
): Promise<{ classification: Classification; llm_source: string }> {
  const fromClaude = await claudeClassify(text, overrides).catch((e) => { console.error(e); return null; });
  if (fromClaude) return { classification: fromClaude, llm_source: 'anthropic' };
  const fromOpenAI = await openaiClassify(text, overrides).catch((e) => { console.error(e); return null; });
  if (fromOpenAI) return { classification: fromOpenAI, llm_source: 'openai' };
  return { classification: regexClassify(text), llm_source: 'regex' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- classify`
Expected: all pass

- [ ] **Step 5: Live verification of the REAL Claude path** (not just regex — the Anthropic key is live now)

Write a small throwaway script or use `node -e` with `tsx`/ts-node (check what's available; if neither, add a temporary console.log-based test route and remove it after) to call `classifyCapture("call the dentist tomorrow, need to reschedule", [])` directly and print the result. Confirm `llm_source: 'anthropic'` and sane `priority`/`category` values. This does not touch the database — no cleanup needed, just confirms the live prompt produces valid output against the new schema.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/classify.ts tests/classify.test.ts
git commit -m "feat: classifier — category + binary priority, replacing 4-tier urgency (TDD)"
```

---

### Task 8: Capture pipeline — use category/status/key instead of urgency/priority_score

**Files:**
- Modify: `lib/capture.ts`

- [ ] **Step 1: Rewrite the task-insert branch and remove `TIER_BASE`**

```ts
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
}): Promise<CaptureResult> {
  const db = serviceClient();

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

  const { classification, llm_source } = await classifyCapture(opts.text, overrides);

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

  const { error: auditErr } = await db.from('audit_log').insert({
    user_id: USER_ID, action: 'capture', resource_type: routedTo, resource_id: routedId,
    metadata: { source: opts.source, llm_source },
  });
  if (auditErr) console.error('audit insert failed', auditErr.message);

  return { captureId: capture.id, routedTo, routedId, classification };
}
```

Note: `TIER_BASE` export is now gone from this file. Search the codebase for other importers before finishing this task:

```bash
grep -rn "TIER_BASE" /Users/brendanang/Documents/personal-os --include="*.ts" --include="*.tsx"
```

At time of writing, `app/api/tasks/route.ts`'s `POST` handler also imports `TIER_BASE` — that will be fixed in Task 9 below in this same phase. If grep finds it anywhere else, fix those too before committing.

- [ ] **Step 2: Verify `npm run build`** — expect a residual error in `app/api/tasks/route.ts`'s POST handler (still imports `TIER_BASE`); fixed in the next step, not a blocker to finishing this file's edit.

- [ ] **Step 3: Fix `app/api/tasks/route.ts`'s `POST` handler in the same commit** (it's tightly coupled to this change)

```ts
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const db = serviceClient();
  const { data, error } = await db.from('tasks').insert({
    user_id: USER_ID,
    title: body.title.trim(),
    description: body.description ?? null,
    key: body.key ?? false,
    category: body.category ?? 'personal',
    status: body.status ?? 'not_started',
    time_estimate_min: body.time_estimate_min ?? null,
    tags: body.tags ?? [],
    due_date: body.due_date ?? null,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

(Leave the `GET` handler from Task 5 untouched — only `POST` changes here. Remove the now-unused `import { TIER_BASE } from '@/lib/capture';` line from the top of the file.)

- [ ] **Step 4: Verify `npm run build` succeeds cleanly**

- [ ] **Step 5: Live verification**

Create a task via `POST /api/capture` with real text (e.g. "email the client about the proposal today") — confirm it lands with `category: 'business'`, `key: true`, `status: 'not_started'` (real Claude call, since the key is live). Delete the task, confirm `tasks`/`raw_captures`/`audit_log` cleaned up (check the specific rows created, not just re-running a blanket empty-check if other legitimate data might exist by this point in the session — use the returned ids to target deletes precisely).

- [ ] **Step 6: Commit**

```bash
git add lib/capture.ts app/api/tasks/route.ts
git commit -m "feat: capture pipeline + task creation use category/status/key, drop TIER_BASE"
```

---

### Task 9: Telegram webhook — new inline keyboard for category/priority

**Files:**
- Modify: `app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Remove the local `URGENCY_LABELS` constant and `urgencyKeyboard` function, replace with the new binary model**

First delete the file-local (not the `lib/types.ts` one — this route declares its own copy inline near the top of the file) `const URGENCY_LABELS: Record<string, string> = {...}` declaration and the `urgencyKeyboard` function entirely — both become dead code once nothing in this file references them. Then add:

```ts
function taskActionKeyboard(taskId: string) {
  return {
    inline_keyboard: [
      [
        { text: '⭐ Today', callback_data: `p|${taskId}|today` },
        { text: 'Not today', callback_data: `p|${taskId}|dash` },
      ],
      [
        { text: 'Personal', callback_data: `c|${taskId}|personal` },
        { text: 'Business', callback_data: `c|${taskId}|business` },
      ],
    ],
  };
}
```

(`callback_data` length check: `"p|<uuid36>|today"` = 43 bytes, `"c|<uuid36>|business"` = 46 bytes — both well under Telegram's 64-byte limit.)

- [ ] **Step 2: Update `handleMessage`'s reply construction**

Replace the `if (c.kind === 'task' ...)` branch's body:

```ts
  if (c.kind === 'task' && result.routedId) {
    const est = c.time_estimate_min ? ` · est ${c.time_estimate_min}m` : '';
    const priorityLabel = c.priority === 'today' ? 'Today' : '—';
    await tgSendMessage(
      chatId,
      `✅ Task: ${c.summary}\n${priorityLabel} · ${c.category}${est}${flag}`,
      taskActionKeyboard(result.routedId),
    );
  } else if (c.kind === 'journal') {
```

- [ ] **Step 3: Rewrite `handleCallback`**

```ts
async function handleCallback(cb: CallbackQuery) {
  if (String(cb.from?.id) !== process.env.TELEGRAM_USER_ID) return;
  const [op, taskId, value] = String(cb.data ?? '').split('|');
  if (!op || !taskId) return;
  const db = serviceClient();

  if (op === 'p') {
    const { error } = await db.from('tasks')
      .update({ key: value === 'today', updated_at: new Date().toISOString() })
      .eq('id', taskId).eq('user_id', USER_ID);
    if (error) throw new Error(error.message);
    await recordOverride(taskId, { key: value === 'today' });
    await tgAnswerCallback(cb.id, value === 'today' ? '⭐ Marked Today' : 'Unmarked');
  } else if (op === 'c') {
    const { error } = await db.from('tasks')
      .update({ category: value, updated_at: new Date().toISOString() })
      .eq('id', taskId).eq('user_id', USER_ID);
    if (error) throw new Error(error.message);
    await recordOverride(taskId, { category: value });
    await tgAnswerCallback(cb.id, `Set to ${value}`);
  }
}
```

`recordOverride` itself is unchanged — it already accepts an arbitrary `Record<string, unknown>` patch.

- [ ] **Step 4: Verify `npm run build` succeeds**

- [ ] **Step 5: Live verification**

Background dev server. Simulate a webhook POST with a real text message ("buy groceries for dinner") using the correct secret header and `TELEGRAM_USER_ID` — confirm a real Claude classification happens and a task is created with the new fields. Simulate a callback `p|<id>|today` — confirm `key` flips to `true` and an override is recorded. Simulate `c|<id>|business` — confirm `category` updates and the override merges (not overwrites) with the prior `key` override. Clean up: delete the test task, its `raw_captures` row, and its `audit_log` row; confirm all three tables show no trace of the test data afterward (query by the specific ids, don't assume a blanket empty check). Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add app/api/telegram/webhook/route.ts
git commit -m "feat: telegram webhook — category/priority inline keyboard, replacing 4-tier urgency buttons"
```

---

## Phase C — Pure logic + shared primitives

### Task 10: Clock input parsing (TDD)

**Files:**
- Create: `lib/clockInput.ts`
- Test: `tests/clockInput.test.ts`

- [ ] **Step 1: Write the failing tests** — ported directly from the design handoff's `parseClockInput`/`clockStr`/`fmt` logic (`Task Dashboard.dc.html` lines 171-211), expressed in minutes (this app's existing unit) rather than seconds, since `time_estimate_min`/`actual_time_min` are stored as integer minutes in the schema — NOT seconds like the raw mockup. The mockup's `HH:MM:SS` becomes this app's `HH:MM` (no seconds field needed for a minutes-granularity value); the right-to-left digit-fill behavior is preserved.

```ts
import { describe, it, expect } from 'vitest';
import { formatClock, parseClockInput } from '@/lib/clockInput';

describe('formatClock', () => {
  it('formats minutes as HH:MM', () => {
    expect(formatClock(90)).toBe('01:30');
    expect(formatClock(5)).toBe('00:05');
    expect(formatClock(0)).toBe('00:00');
  });
  it('clamps negative/undefined to 00:00', () => {
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(undefined as unknown as number)).toBe('00:00');
  });
});

describe('parseClockInput', () => {
  it('fills digits right-to-left like a stopwatch entry', () => {
    // typing "130" into an HH:MM field should read as 01:30 (90 minutes)
    expect(parseClockInput('130')).toBe(90);
  });
  it('strips non-digit characters before parsing', () => {
    expect(parseClockInput('01:30')).toBe(90);
    expect(parseClockInput('abc12de34')).toBe(parseClockInput('1234'));
  });
  it('clamps minutes to 0-59 and takes only the last 4 digits', () => {
    expect(parseClockInput('9999')).toBe(9 * 60 + 59); // HH=99 (not clamped, hours can exceed 59), MM clamped to 59
    expect(parseClockInput('123456')).toBe(parseClockInput('3456')); // only last 4 digits kept
  });
  it('handles empty input as 0', () => {
    expect(parseClockInput('')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- clockInput`
Expected: FAIL — cannot resolve `@/lib/clockInput`

- [ ] **Step 3: Create `lib/clockInput.ts`**

```ts
/** Minutes -> "HH:MM" display string. */
export function formatClock(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes || 0));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Right-to-left digit-fill parser, ported from the design handoff's
 * parseClockInput (Task Dashboard.dc.html): strip non-digits, take the
 * last 4 (HHMM — this app stores minutes, not the mockup's HH:MM:SS
 * seconds-precision), split into HH/MM, clamp MM to 0-59, return total
 * minutes. This makes typing digits into the field behave like a
 * stopwatch/odometer entry — impossible to type letters or malformed values.
 */
export function parseClockInput(raw: string): number {
  let digits = (raw || '').replace(/\D/g, '');
  digits = digits.slice(-4).padStart(4, '0');
  const hh = parseInt(digits.slice(0, 2), 10);
  const mm = Math.min(59, parseInt(digits.slice(2, 4), 10));
  return hh * 60 + mm;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- clockInput`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add lib/clockInput.ts tests/clockInput.test.ts
git commit -m "feat: clock input HH:MM parse/format helpers, ported from design handoff (TDD)"
```

---

### Task 11: Task sort rule (TDD)

**Files:**
- Create: `lib/taskSort.ts`
- Test: `tests/taskSort.test.ts`

- [ ] **Step 1: Write the failing tests** — ported from `Task Dashboard.dc.html`'s `taskRank()` (lines 253-261), adapted to this app's field names (`key` instead of `priority === 'today'`, `status` unchanged)

```ts
import { describe, it, expect } from 'vitest';
import { sortTasks, type SortableTask } from '@/lib/taskSort';

const t = (id: string, status: SortableTask['status'], key: boolean): SortableTask =>
  ({ id, status, key });

describe('sortTasks', () => {
  it('ranks in_progress+today first, then not_started+today, then in_progress, then not_started, completed always last', () => {
    const tasks = [
      t('completed-today', 'completed', true),
      t('not-started-plain', 'not_started', false),
      t('in-progress-plain', 'in_progress', false),
      t('not-started-today', 'not_started', true),
      t('in-progress-today', 'in_progress', true),
    ];
    const sorted = sortTasks(tasks).map((x) => x.id);
    expect(sorted).toEqual([
      'in-progress-today',
      'not-started-today',
      'in-progress-plain',
      'not-started-plain',
      'completed-today',
    ]);
  });
  it('completed sorts last regardless of key/priority', () => {
    const tasks = [t('a', 'completed', true), t('b', 'not_started', false)];
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('is a stable sort — preserves relative order within the same rank', () => {
    const tasks = [t('first', 'not_started', false), t('second', 'not_started', false)];
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['first', 'second']);
  });
  it('does not mutate the input array', () => {
    const tasks = [t('a', 'completed', false), t('b', 'not_started', true)];
    const original = [...tasks];
    sortTasks(tasks);
    expect(tasks).toEqual(original);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- taskSort`
Expected: FAIL — cannot resolve `@/lib/taskSort`

- [ ] **Step 3: Create `lib/taskSort.ts`**

```ts
export interface SortableTask {
  id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  key: boolean; // true = "TODAY" priority
}

/**
 * Fixed, always-applied sort rule — ported from the design handoff's
 * taskRank(). Not user-draggable; recomputed on every render. Completed
 * tasks always sort last regardless of priority.
 */
function rank(t: SortableTask): number {
  if (t.status === 'completed') return 4;
  const inProgress = t.status === 'in_progress';
  if (inProgress && t.key) return 0;
  if (!inProgress && t.key) return 1;
  if (inProgress) return 2;
  return 3;
}

export function sortTasks<T extends SortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => rank(a) - rank(b));
}
```

(`Array.prototype.sort` in modern JS engines — Node 12+, all evergreen browsers — is a stable sort per the ECMAScript spec, so ties preserve original order without extra bookkeeping.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- taskSort`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add lib/taskSort.ts tests/taskSort.test.ts
git commit -m "feat: fixed task sort rule, ported from design handoff (TDD)"
```

---

### Task 12: `useMediaQuery` hook

**Files:**
- Create: `lib/useMediaQuery.ts`

- [ ] **Step 1: Create the hook**

```ts
'use client';
import { useEffect, useState } from 'react';

/**
 * SSR-safe media query hook. Defaults to `false` on the server and first
 * client render (no window), then syncs to the real value after mount —
 * matches this app's existing pattern of avoiding hydration mismatches
 * (see components/dashboard/TimerStrip.tsx's clock for the same approach).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
```

- [ ] **Step 2: Verify `npm run build` succeeds** (no consumers yet, just confirm it compiles)

- [ ] **Step 3: Commit**

```bash
git add lib/useMediaQuery.ts
git commit -m "feat: useMediaQuery hook for desktop/mobile Task Dashboard split"
```

---

### Task 13: `ClockInput` component

**Files:**
- Create: `components/tasks/ClockInput.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';
import { useState } from 'react';
import { formatClock, parseClockInput } from '@/lib/clockInput';

/**
 * HH:MM clock-style input. Digits fill right-to-left like a stopwatch
 * entry (see lib/clockInput.ts) — the user can never type a letter or
 * malformed value. Commits on blur (calling onChange with the parsed
 * minutes), matching the rest of this app's edit-then-blur pattern
 * (e.g. components/dashboard/SessionCard.tsx's focus field).
 */
export default function ClockInput({ minutes, onChange, size = 'md' }: {
  minutes: number;
  onChange: (minutes: number) => void;
  size?: 'md' | 'sm';
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? formatClock(minutes);

  function commit() {
    if (draft === null) return;
    onChange(parseClockInput(draft));
    setDraft(null);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        border: '1px solid rgba(17,17,17,.1)', borderRadius: 5,
        background: '#fff', color: 'rgba(17,17,17,.75)',
        textAlign: 'center', letterSpacing: '.03em',
        width: size === 'sm' ? '100%' : 82,
        fontSize: size === 'sm' ? 13.5 : 14,
        padding: size === 'sm' ? '6px 4px' : '4px 8px',
      }}
    />
  );
}
```

- [ ] **Step 2: Verify `npm run build` succeeds**

- [ ] **Step 3: Commit**

```bash
git add components/tasks/ClockInput.tsx
git commit -m "feat: ClockInput component — HH:MM right-to-left digit entry"
```

---

### Task 14: `FieldPopover` component

**Files:**
- Create: `components/tasks/FieldPopover.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';
import { useState } from 'react';

interface PopoverOption {
  label: string;
  onSelect: () => void;
}

/**
 * Click-to-open, click-outside-to-close, single-select popover — used for
 * every inline Category/Status/Priority field on both desktop and mobile.
 * A full-screen invisible overlay (position:fixed, inset:0) behind the
 * popover catches outside clicks; the popover itself stops propagation so
 * clicking inside doesn't immediately close it (matches the design
 * handoff's stopClick/closeAllPopovers pattern exactly).
 */
export default function FieldPopover({ trigger, options, align = 'left' }: {
  trigger: React.ReactNode;
  options: PopoverOption[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: 32, [align]: 0, zIndex: 60,
              background: '#fff', border: '1px solid rgba(17,17,17,.12)',
              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
              padding: 6, display: 'flex', flexDirection: 'column', gap: 1,
              minWidth: 150,
            }}
          >
            {options.map((opt) => (
              <div
                key={opt.label}
                onClick={() => { opt.onSelect(); setOpen(false); }}
                style={{
                  padding: '8px 10px', borderRadius: 5, cursor: 'pointer',
                  font: "500 13px 'Inter Tight', sans-serif", color: '#111',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `npm run build` succeeds**

- [ ] **Step 3: Commit**

```bash
git add components/tasks/FieldPopover.tsx
git commit -m "feat: FieldPopover — shared click-to-select inline popover"
```

---

### Task 15: `useTaskDashboard` hook

**Files:**
- Create: `lib/useTaskDashboard.ts`

- [ ] **Step 1: Create the hook**

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import { sortTasks } from '@/lib/taskSort';

async function fetchAllTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks?status=all');
  if (!res.ok) { console.error('fetchAllTasks failed', res.status, await res.text()); return []; }
  return res.json();
}

async function patchTask(id: string, patch: Partial<Task>): Promise<Task | null> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchTask failed', res.status, await res.text()); return null; }
  return res.json();
}

async function deleteTaskApi(id: string): Promise<boolean> {
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) console.error('deleteTask failed', res.status, await res.text());
  return res.ok;
}

async function startTimerApi(taskId: string): Promise<boolean> {
  const res = await fetch('/api/timers/start', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) console.error('startTimer failed', res.status, await res.text());
  return res.ok;
}

async function stopTimerApi(taskId: string): Promise<boolean> {
  const res = await fetch('/api/timers/stop', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) console.error('stopTimer failed', res.status, await res.text());
  return res.ok;
}

export function useTaskDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilters, setStatusFilters] = useState<Task['status'][]>([]);
  const [priorityFilters, setPriorityFilters] = useState<('today' | 'dash')[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const pendingRemovalRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await fetchAllTasks();
    const withoutPendingRemovals = data.filter((d) => !pendingRemovalRef.current.has(d.id));
    if (!dirtyRef.current) setTasks(withoutPendingRemovals);
    else setTasks((cur) =>
      withoutPendingRemovals.map((d) => cur.find((c) => c.id === d.id && c.updated_at > d.updated_at) ?? d));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('capture:done', load);
    return () => window.removeEventListener('capture:done', load);
  }, [load]);

  const applyPatch = useCallback(async (id: string, patch: Partial<Task>) => {
    dirtyRef.current = true;
    const optimisticPatch = { ...patch, updated_at: new Date().toISOString() };
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...optimisticPatch } : t)));
    const saved = await patchTask(id, patch);
    if (saved) setTasks((cur) => cur.map((t) => (t.id === id ? { ...saved, active_timer: t.active_timer } : t)));
    else load();
  }, [load]);

  const deleteTask = useCallback(async (id: string) => {
    dirtyRef.current = true;
    pendingRemovalRef.current.add(id);
    setTasks((cur) => cur.filter((t) => t.id !== id));
    const ok = await deleteTaskApi(id);
    pendingRemovalRef.current.delete(id);
    if (!ok) load();
  }, [load]);

  const startTimer = useCallback(async (taskId: string) => {
    const ok = await startTimerApi(taskId);
    if (ok) load(); // refetch to pick up the new active_timer from the server
  }, [load]);

  const stopTimer = useCallback(async (taskId: string) => {
    const ok = await stopTimerApi(taskId);
    if (ok) load();
  }, [load]);

  const toggleFilter = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const filtered = tasks.filter((t) =>
    (statusFilters.length === 0 || statusFilters.includes(t.status)) &&
    (priorityFilters.length === 0 || priorityFilters.includes(t.key ? 'today' : 'dash')));
  const sorted = sortTasks(filtered);

  return {
    tasks: sorted,
    statusFilters, priorityFilters,
    toggleStatusFilter: (v: Task['status']) => setStatusFilters((f) => toggleFilter(f, v)),
    togglePriorityFilter: (v: 'today' | 'dash') => setPriorityFilters((f) => toggleFilter(f, v)),
    activeTaskId, setActiveTaskId,
    activeTask: tasks.find((t) => t.id === activeTaskId) ?? null,
    updateCategory: (id: string, category: Task['category']) => applyPatch(id, { category }),
    updateStatus: (id: string, status: Task['status']) => applyPatch(id, { status }),
    updatePriority: (id: string, today: boolean) => applyPatch(id, { key: today }),
    updateExpected: (id: string, time_estimate_min: number) => applyPatch(id, { time_estimate_min }),
    updateActual: (id: string, actual_time_min: number) => applyPatch(id, { actual_time_min }),
    updateName: (id: string, title: string) => applyPatch(id, { title }),
    updateDescription: (id: string, description: string) => applyPatch(id, { description }),
    deleteTask,
    startTimer, stopTimer,
  };
}
```

- [ ] **Step 2: Verify `npm run build` succeeds**

- [ ] **Step 3: Commit**

```bash
git add lib/useTaskDashboard.ts
git commit -m "feat: useTaskDashboard hook — single state owner for the new Task Dashboard"
```

---

## Phase D — Detail views + desktop/mobile boards

### Task 16: `TaskDetailModal` (desktop) + `TaskDetailSheet` (mobile)

**Files:**
- Create: `components/tasks/TaskDetailModal.tsx`, `components/tasks/TaskDetailSheet.tsx`

- [ ] **Step 1: Create `components/tasks/TaskDetailModal.tsx`** (centered modal, per README's Task Detail Modal section)

```tsx
'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';

export default function TaskDetailModal({ task, onClose, onSave }: {
  task: Task;
  onClose: () => void;
  onSave: (patch: { title?: string; description?: string }) => void;
}) {
  const [name, setName] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');

  function done() {
    if (name !== task.title) onSave({ title: name });
    if (description !== (task.description ?? '')) onSave({ description });
    onClose();
  }

  return (
    <div
      onClick={done}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,17,17,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 70, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fbfaf7', borderRadius: 12, width: 520, maxWidth: '100%',
          maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ padding: '32px 32px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            style={{
              flex: 1, font: "700 21px 'Inter Tight', sans-serif", color: '#111',
              letterSpacing: '-0.01em', padding: '4px 0', border: 'none', outline: 'none', background: 'transparent',
            }}
          />
          <span onClick={done} style={{ cursor: 'pointer', color: 'rgba(17,17,17,.4)', fontSize: 18, padding: 4 }}>✕</span>
        </div>
        <div style={{ padding: '8px 32px 32px' }}>
          <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Description
          </div>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this task…"
            style={{
              width: '100%', minHeight: 140, fontSize: 14, lineHeight: 1.5, color: '#111',
              resize: 'vertical', padding: '12px 14px', border: '1px solid rgba(17,17,17,.1)',
              borderRadius: 6, background: '#fff', boxSizing: 'border-box',
              fontFamily: "'Inter Tight', sans-serif", outline: 'none',
            }}
          />
        </div>
        <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(17,17,17,.08)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={done}
            style={{
              font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#111',
              border: 'none', borderRadius: 7, padding: '10px 22px', cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/tasks/TaskDetailSheet.tsx`** (bottom sheet, per README's mobile Description sheet section)

```tsx
'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';

export default function TaskDetailSheet({ task, onClose, onSave }: {
  task: Task;
  onClose: () => void;
  onSave: (patch: { title?: string; description?: string }) => void;
}) {
  const [name, setName] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');

  function done() {
    if (name !== task.title) onSave({ title: name });
    if (description !== (task.description ?? '')) onSave({ description });
    onClose();
  }

  return (
    <div
      onClick={done}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,17,17,.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fbfaf7', borderRadius: '20px 20px 0 0', width: 390, maxWidth: '100%',
          maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 -10px 40px rgba(0,0,0,.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 3, background: 'rgba(17,17,17,.15)' }} />
        </div>
        <div style={{ padding: '16px 24px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            style={{
              flex: 1, font: "700 19px 'Inter Tight', sans-serif", color: '#111',
              letterSpacing: '-0.01em', border: 'none', outline: 'none', background: 'transparent',
            }}
          />
          <span onClick={done} style={{ cursor: 'pointer', color: 'rgba(17,17,17,.4)', fontSize: 17, padding: 4 }}>✕</span>
        </div>
        <div style={{ padding: '8px 24px 28px' }}>
          <div style={{ font: "700 10px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Description
          </div>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this task…"
            style={{
              width: '100%', minHeight: 120, fontSize: 14, lineHeight: 1.5, color: '#111',
              resize: 'vertical', padding: '12px 14px', border: '1px solid rgba(17,17,17,.1)',
              borderRadius: 8, background: '#fff', boxSizing: 'border-box',
              fontFamily: "'Inter Tight', sans-serif", outline: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify `npm run build` succeeds**

- [ ] **Step 4: Commit**

```bash
git add components/tasks/TaskDetailModal.tsx components/tasks/TaskDetailSheet.tsx
git commit -m "feat: TaskDetailModal (desktop) + TaskDetailSheet (mobile) — description editors"
```

---

### Task 17: `useLiveTimer` hook (per-row live tick)

**Files:**
- Create: `lib/useLiveTimer.ts`

- [ ] **Step 1: Create the hook**

```ts
'use client';
import { useEffect, useState } from 'react';

/**
 * Live-ticking elapsed minutes for a running timer session, recomputed
 * from Date.now() - startedAt every second (not incrementally accumulated
 * — same pattern as the old global TimerStrip, now instantiated per-row).
 * Returns 0 when startedAt is null (no running session for this task).
 */
export function useLiveTimer(startedAt: string | null): number {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return 0;
  return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 60_000);
}
```

- [ ] **Step 2: Verify `npm run build` succeeds**

- [ ] **Step 3: Commit**

```bash
git add lib/useLiveTimer.ts
git commit -m "feat: useLiveTimer hook — per-row live elapsed-time tick"
```

---

### Task 18: `TaskBoardDesktop` component

**Files:**
- Create: `components/tasks/TaskBoardDesktop.tsx`

- [ ] **Step 1: Create the component** — 7-column grid table per the README's Desktop section (exact column widths, gap, dividers, header filters, row cells)

```tsx
'use client';
import { useTaskDashboard } from '@/lib/useTaskDashboard';
import { useLiveTimer } from '@/lib/useLiveTimer';
import ClockInput from './ClockInput';
import FieldPopover from './FieldPopover';
import TaskDetailModal from './TaskDetailModal';
import type { Task } from '@/lib/types';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/lib/types';

const STATUS_DOT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.3)', in_progress: '#eab308', completed: '#2f9e44',
};
const STATUS_TEXT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.45)', in_progress: '#a16207', completed: '#227a37',
};

function TimerCell({ task, onStart, onStop }: {
  task: Task; onStart: () => void; onStop: () => void;
}) {
  const liveMin = useLiveTimer(task.active_timer?.started_at ?? null);
  if (task.status === 'completed') {
    return <span style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.3)' }}>—</span>;
  }
  const running = !!task.active_timer;
  const totalMin = running ? task.actual_time_min + liveMin : task.actual_time_min;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(Math.floor(totalMin % 60)).padStart(2, '0');
  const ss = String(Math.floor((totalMin * 60) % 60)).padStart(2, '0');
  return (
    <div onClick={running ? onStop : onStart} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>{running ? '⏳' : '⌛'}</span>
      <span style={{
        fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, fontWeight: 600,
        letterSpacing: '.02em', color: running ? '#9a7a2e' : '#111',
      }}>{hh}:{mm}:{ss}</span>
    </div>
  );
}

export default function TaskBoardDesktop() {
  const d = useTaskDashboard();

  const colStyle = { fontFamily: "'Archivo', sans-serif" };

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '56px 24px', background: '#f3f1ec' }}>
      <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, boxShadow: '0 2px 18px rgba(0,0,0,.05)' }}>
        <div style={{ padding: '40px 44px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 36 }}>
            <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Task Dashboard</div>
            <div style={{
              font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '2fr .9fr 1.1fr .8fr .9fr .9fr 1fr',
            columnGap: 28, borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2,
          }}>
            <div style={{ ...colStyle, font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase' }}>Task</div>
            <div style={{ ...colStyle, font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>Category</div>
            <div style={{ marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>
              <FieldPopover
                align="left"
                trigger={
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    font: "700 13px 'Archivo', sans-serif",
                    color: d.statusFilters.length > 0 ? '#9a7a2e' : '#111',
                    letterSpacing: '.02em', textTransform: 'uppercase',
                  }}>Status <span style={{ fontSize: 9 }}>▾</span></span>
                }
                options={(['not_started', 'in_progress', 'completed'] as const).map((s) => ({
                  label: `${d.statusFilters.includes(s) ? '✓ ' : ''}${STATUS_LABELS[s]}`,
                  onSelect: () => d.toggleStatusFilter(s),
                }))}
              />
            </div>
            <div style={{ marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>
              <FieldPopover
                align="left"
                trigger={
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    font: "700 13px 'Archivo', sans-serif",
                    color: d.priorityFilters.length > 0 ? '#9a7a2e' : '#111',
                    letterSpacing: '.02em', textTransform: 'uppercase',
                  }}>Priority <span style={{ fontSize: 9 }}>▾</span></span>
                }
                options={([['today', 'Today'], ['dash', '—']] as const).map(([v, label]) => ({
                  label: `${d.priorityFilters.includes(v) ? '✓ ' : ''}${label}`,
                  onSelect: () => d.togglePriorityFilter(v),
                }))}
              />
            </div>
            <div style={{ ...colStyle, font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>Exp. Time</div>
            <div style={{ ...colStyle, font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>Actual Time</div>
            <div style={{ ...colStyle, font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>Timer</div>
          </div>

          {d.tasks.map((task) => {
            const isCompleted = task.status === 'completed';
            return (
              <div key={task.id} style={{
                display: 'grid', gridTemplateColumns: '2fr .9fr 1.1fr .8fr .9fr .9fr 1fr',
                columnGap: 28, borderBottom: '1px solid rgba(17,17,17,.08)',
              }}>
                <div
                  onClick={() => d.setActiveTaskId(task.id)}
                  style={{
                    font: "500 15px 'Inter Tight', sans-serif",
                    color: isCompleted ? 'rgba(17,17,17,.4)' : '#111',
                    padding: '18px 0', textDecoration: isCompleted ? 'line-through' : 'none',
                    textDecorationColor: 'rgba(17,17,17,.25)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                  }}
                >{task.title}</div>

                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <FieldPopover
                    trigger={<span style={{
                      font: "600 12px 'Inter Tight', sans-serif",
                      color: task.category === 'business' ? '#9a7a2e' : 'rgba(17,17,17,.55)',
                    }}>{CATEGORY_LABELS[task.category]}</span>}
                    options={[
                      { label: 'Personal', onSelect: () => d.updateCategory(task.id, 'personal') },
                      { label: 'Business', onSelect: () => d.updateCategory(task.id, 'business') },
                    ]}
                  />
                </div>

                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <FieldPopover
                    trigger={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: "600 12px 'Inter Tight', sans-serif", color: STATUS_TEXT[task.status] }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[task.status] }} />
                        {STATUS_LABELS[task.status]}
                      </span>
                    }
                    options={[
                      { label: 'Not started', onSelect: () => d.updateStatus(task.id, 'not_started') },
                      { label: 'In progress', onSelect: () => d.updateStatus(task.id, 'in_progress') },
                      { label: 'Completed', onSelect: () => d.updateStatus(task.id, 'completed') },
                    ]}
                  />
                </div>

                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <FieldPopover
                    trigger={
                      task.key
                        ? <span style={{ font: "700 11px 'Inter Tight', sans-serif", color: '#9a7a2e', background: 'rgba(198,161,91,.14)', padding: '4px 9px', borderRadius: 20, letterSpacing: '.03em' }}>TODAY</span>
                        : <span style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.3)' }}>—</span>
                    }
                    options={[
                      { label: 'Today', onSelect: () => d.updatePriority(task.id, true) },
                      { label: '—', onSelect: () => d.updatePriority(task.id, false) },
                    ]}
                  />
                </div>

                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <ClockInput minutes={task.time_estimate_min ?? 0} onChange={(m) => d.updateExpected(task.id, m)} />
                </div>
                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <ClockInput minutes={task.actual_time_min} onChange={(m) => d.updateActual(task.id, m)} />
                </div>
                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <TimerCell task={task} onStart={() => d.startTimer(task.id)} onStop={() => d.stopTimer(task.id)} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 32 }} />
      </div>

      {d.activeTask && (
        <TaskDetailModal
          task={d.activeTask}
          onClose={() => d.setActiveTaskId(null)}
          onSave={(patch) => {
            if (patch.title !== undefined) d.updateName(d.activeTask!.id, patch.title);
            if (patch.description !== undefined) d.updateDescription(d.activeTask!.id, patch.description);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `npm run build` succeeds**

- [ ] **Step 3: Commit**

```bash
git add components/tasks/TaskBoardDesktop.tsx
git commit -m "feat: TaskBoardDesktop — 7-column table view, pixel-close to design handoff"
```

---

### Task 19: `TaskBoardMobile` component

**Files:**
- Create: `components/tasks/TaskBoardMobile.tsx`

- [ ] **Step 1: Create the component** — card stack per the README's Mobile section (fixed header + filter chips, scrolling card stack, bottom sheet on tap)

```tsx
'use client';
import { useTaskDashboard } from '@/lib/useTaskDashboard';
import { useLiveTimer } from '@/lib/useLiveTimer';
import ClockInput from './ClockInput';
import FieldPopover from './FieldPopover';
import TaskDetailSheet from './TaskDetailSheet';
import type { Task } from '@/lib/types';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/lib/types';

const STATUS_DOT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.3)', in_progress: '#eab308', completed: '#2f9e44',
};
const STATUS_TEXT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.45)', in_progress: '#a16207', completed: '#227a37',
};

function MobileTimer({ task, onStart, onStop }: {
  task: Task; onStart: () => void; onStop: () => void;
}) {
  const liveMin = useLiveTimer(task.active_timer?.started_at ?? null);
  const running = !!task.active_timer;
  const totalMin = running ? task.actual_time_min + liveMin : task.actual_time_min;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(Math.floor(totalMin % 60)).padStart(2, '0');
  const ss = String(Math.floor((totalMin * 60) % 60)).padStart(2, '0');
  return (
    <div onClick={running ? onStop : onStart} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <span style={{ fontSize: 17, lineHeight: 1 }}>{running ? '⏳' : '⌛'}</span>
      <span style={{
        fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, fontWeight: 600,
        letterSpacing: '.02em', color: running ? '#9a7a2e' : '#111',
      }}>{hh}:{mm}:{ss}</span>
    </div>
  );
}

export default function TaskBoardMobile() {
  const d = useTaskDashboard();
  const sfActive = d.statusFilters.length > 0;
  const pfActive = d.priorityFilters.length > 0;

  return (
    <div style={{ background: '#f3f1ec', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 20px 16px', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Task Dashboard</div>
        </div>
        <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, overflowX: 'auto' }}>
          <FieldPopover
            trigger={
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 20,
                border: `1px solid ${sfActive ? 'rgba(198,161,91,.4)' : 'rgba(17,17,17,.12)'}`,
                background: sfActive ? 'rgba(198,161,91,.1)' : '#fff',
                font: "600 12.5px 'Inter Tight', sans-serif", color: sfActive ? '#9a7a2e' : '#111',
              }}>Status <span style={{ fontSize: 8 }}>▾</span></span>
            }
            options={(['not_started', 'in_progress', 'completed'] as const).map((s) => ({
              label: `${d.statusFilters.includes(s) ? '✓ ' : ''}${STATUS_LABELS[s]}`,
              onSelect: () => d.toggleStatusFilter(s),
            }))}
          />
          <FieldPopover
            trigger={
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 20,
                border: `1px solid ${pfActive ? 'rgba(198,161,91,.4)' : 'rgba(17,17,17,.12)'}`,
                background: pfActive ? 'rgba(198,161,91,.1)' : '#fff',
                font: "600 12.5px 'Inter Tight', sans-serif", color: pfActive ? '#9a7a2e' : '#111',
              }}>Priority <span style={{ fontSize: 8 }}>▾</span></span>
            }
            options={([['today', 'Today'], ['dash', 'No priority']] as const).map(([v, label]) => ({
              label: `${d.priorityFilters.includes(v) ? '✓ ' : ''}${label}`,
              onSelect: () => d.togglePriorityFilter(v),
            }))}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.tasks.map((task) => {
          const isCompleted = task.status === 'completed';
          return (
            <div key={task.id} style={{
              background: '#fbfaf7', border: '1px solid rgba(17,17,17,.08)', borderRadius: 14,
              padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                <div
                  onClick={() => d.setActiveTaskId(task.id)}
                  style={{
                    font: "600 16px 'Inter Tight', sans-serif",
                    color: isCompleted ? 'rgba(17,17,17,.4)' : '#111',
                    textDecoration: isCompleted ? 'line-through' : 'none',
                    textDecorationColor: 'rgba(17,17,17,.25)', flex: 1,
                  }}
                >{task.title}</div>
                <MobileTimer task={task} onStart={() => d.startTimer(task.id)} onStop={() => d.stopTimer(task.id)} />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <FieldPopover
                  trigger={<span style={{
                    padding: '5px 11px', borderRadius: 20, background: 'rgba(17,17,17,.05)',
                    font: "600 11.5px 'Inter Tight', sans-serif",
                    color: task.category === 'business' ? '#9a7a2e' : 'rgba(17,17,17,.55)',
                  }}>{CATEGORY_LABELS[task.category]}</span>}
                  options={[
                    { label: 'Personal', onSelect: () => d.updateCategory(task.id, 'personal') },
                    { label: 'Business', onSelect: () => d.updateCategory(task.id, 'business') },
                  ]}
                />
                <FieldPopover
                  trigger={
                    <span style={{
                      padding: '5px 11px', borderRadius: 20, background: 'rgba(17,17,17,.05)',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      font: "600 11.5px 'Inter Tight', sans-serif", color: STATUS_TEXT[task.status],
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[task.status] }} />
                      {STATUS_LABELS[task.status]}
                    </span>
                  }
                  options={[
                    { label: 'Not started', onSelect: () => d.updateStatus(task.id, 'not_started') },
                    { label: 'In progress', onSelect: () => d.updateStatus(task.id, 'in_progress') },
                    { label: 'Completed', onSelect: () => d.updateStatus(task.id, 'completed') },
                  ]}
                />
                <FieldPopover
                  align="right"
                  trigger={
                    task.key
                      ? <span style={{ font: "700 11px 'Inter Tight', sans-serif", color: '#9a7a2e', background: 'rgba(198,161,91,.14)', padding: '5px 11px', borderRadius: 20, letterSpacing: '.03em' }}>TODAY</span>
                      : <span style={{ font: "600 11.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.35)', background: 'rgba(17,17,17,.05)', padding: '5px 11px', borderRadius: 20 }}>No priority</span>
                  }
                  options={[
                    { label: 'Today', onSelect: () => d.updatePriority(task.id, true) },
                    { label: 'No priority', onSelect: () => d.updatePriority(task.id, false) },
                  ]}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid rgba(17,17,17,.06)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "700 9.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.35)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Expected</div>
                  <ClockInput size="sm" minutes={task.time_estimate_min ?? 0} onChange={(m) => d.updateExpected(task.id, m)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "700 9.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.35)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Actual</div>
                  <ClockInput size="sm" minutes={task.actual_time_min} onChange={(m) => d.updateActual(task.id, m)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {d.activeTask && (
        <TaskDetailSheet
          task={d.activeTask}
          onClose={() => d.setActiveTaskId(null)}
          onSave={(patch) => {
            if (patch.title !== undefined) d.updateName(d.activeTask!.id, patch.title);
            if (patch.description !== undefined) d.updateDescription(d.activeTask!.id, patch.description);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `npm run build` succeeds**

- [ ] **Step 3: Commit**

```bash
git add components/tasks/TaskBoardMobile.tsx
git commit -m "feat: TaskBoardMobile — card stack view, pixel-close to design handoff"
```

---

### Task 20: `app/tasks/page.tsx` — tab switcher + breakpoint dispatch

**Files:**
- Modify: `app/tasks/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
'use client';
import { useState } from 'react';
import { useMediaQuery } from '@/lib/useMediaQuery';
import TaskBoardDesktop from '@/components/tasks/TaskBoardDesktop';
import TaskBoardMobile from '@/components/tasks/TaskBoardMobile';
import SmartView from '@/components/tasks/SmartView';
import { fetchTasks, patchTask, deleteTask as deleteTaskApi, startTimer as startTimerApi } from '@/lib/clientTasks';
import type { Task } from '@/lib/types';
import { useEffect } from 'react';

const TABS = ['board', 'smart'] as const;
type Tab = (typeof TABS)[number];

/** Thin adapter so the unmodified SmartView (built against the legacy
 * fetchTasks('open')/patchTask/deleteTask/startTimer client helpers) keeps
 * working without changes — it only needs a task list + the same four
 * mutation callbacks it already expects. */
function SmartTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => { fetchTasks('open').then(setTasks); }, []);
  return (
    <SmartView
      tasks={tasks}
      onComplete={async (t) => { await patchTask(t.id, { completed_at: new Date().toISOString() } as Partial<Task>); setTasks((c) => c.filter((x) => x.id !== t.id)); }}
      onOpen={() => {}}
      onStartTimer={(t) => startTimerApi(t.id)}
    />
  );
}

export default function TasksPage() {
  const [tab, setTab] = useState<Tab>('board');
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 24px 0', background: '#f3f1ec' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
              font: "600 13px 'Inter Tight', sans-serif", textTransform: 'capitalize',
              background: tab === t ? '#fbfaf7' : 'transparent',
              color: tab === t ? '#111' : 'rgba(17,17,17,.5)',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'board'
        ? (isDesktop ? <TaskBoardDesktop /> : <TaskBoardMobile />)
        : <div style={{ padding: 24 }}><SmartTab /></div>}
    </div>
  );
}
```

Note: `SmartView`'s `onOpen` prop currently opens the OLD `TaskDrawer` via `TaskBoard`'s state — since that whole component tree is deleted in Task 21, `SmartTab`'s adapter above passes a no-op `onOpen`. This is a deliberate, small scope reduction (clicking a task name from Smart search results no longer opens an editor) — acceptable since Smart search's primary job is surfacing/answering, and the user can find the same task in the Board tab to edit it. Note this explicitly in your task report; it's not a silent regression, it's a documented consequence of consolidating around the new Board UI.

- [ ] **Step 2: Verify `npm run build` succeeds.** `SmartView.tsx` and `TaskRow.tsx` are intentionally left unmodified (see decision 6 in the spec) and should compile without changes — `URGENCY_LABELS` was deliberately kept in `lib/types.ts` (Task 4) for exactly this reason. If either file shows a compile error, investigate before proceeding; it likely means something in Task 4 diverged from what's written above.

- [ ] **Step 3: Commit**

```bash
git add app/tasks/page.tsx
git commit -m "feat: Tasks page — Board (new design) + Smart tabs, desktop/mobile breakpoint dispatch"
```

---

## Phase E — Remove superseded code

### Task 21: Delete Kanban, old TaskBoard/TaskDrawer

**Files:**
- Delete: `components/tasks/KanbanView.tsx`, `components/tasks/TaskBoard.tsx`, `components/tasks/TaskDrawer.tsx`
- **Do NOT delete `components/tasks/TaskRow.tsx`** — `SmartView.tsx` (kept unchanged per spec decision 6) imports and renders it directly. Deleting it would break `SmartView`'s build. `lib/clientTasks.ts` also stays untouched — it's a set of plain CRUD helper functions (`fetchTasks`, `patchTask`, `deleteTask`, `startTimer`), never view-toggle-specific, still used by `SmartTab`'s adapter (Task 20).

- [ ] **Step 1: Confirm nothing else imports the three files being deleted, and confirm `TaskRow`/`SmartView` still have a live consumer**

```bash
cd /Users/brendanang/Documents/personal-os
grep -rn "KanbanView\|from '@/components/tasks/TaskBoard'\|from '\./TaskBoard'\|TaskDrawer" \
  app components lib --include="*.tsx" --include="*.ts"
grep -rln "TaskRow" app components lib --include="*.tsx" --include="*.ts"
```

Expected: first grep matches only within the three files being deleted themselves (nothing in `app/tasks/page.tsx`, confirmed rewritten in Task 20). Second grep should show `components/tasks/TaskRow.tsx` (itself) and `components/tasks/SmartView.tsx` (its consumer) — both must be present; if `SmartView.tsx` doesn't show up, something upstream changed and you should investigate before proceeding, since that would mean `TaskRow.tsx` has become genuinely dead code (in which case it'd be fine to delete it too, but confirm first rather than assuming).

- [ ] **Step 2: Delete the three files**

```bash
git rm components/tasks/KanbanView.tsx components/tasks/TaskBoard.tsx components/tasks/TaskDrawer.tsx
```

- [ ] **Step 3: Verify `npm run build` succeeds with no errors** — `TaskRow.tsx` and `SmartView.tsx` should compile completely unchanged.

- [ ] **Step 4: Verify `npm test` still passes** (no tests reference the deleted files)

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove superseded Kanban/TaskBoard/TaskDrawer (TaskRow kept — still used by SmartView)"
```

---

### Task 22: Delete the daily rerank cron

**Files:**
- Delete: `app/api/cron/rerank/route.ts`, `lib/priority.ts`, `tests/priority.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Confirm nothing else imports `lib/priority.ts`**

```bash
grep -rn "lib/priority\|mergeRanks" /Users/brendanang/Documents/personal-os --include="*.ts" --include="*.tsx"
```

Expected: only `app/api/cron/rerank/route.ts` and `tests/priority.test.ts` (both being deleted).

- [ ] **Step 2: Delete the three files**

```bash
cd /Users/brendanang/Documents/personal-os
git rm app/api/cron/rerank/route.ts lib/priority.ts tests/priority.test.ts
```

- [ ] **Step 3: Update `vercel.json`** — remove the cron entry entirely (no crons remain in this app after this change)

```json
{}
```

- [ ] **Step 4: Verify `npm run build` succeeds**

- [ ] **Step 5: Verify `npm test` passes** (the deleted `priority.test.ts`'s tests should simply be gone from the run, not failing)

- [ ] **Step 6: Live cleanup check** — if migration 0003 has been applied and the app has been deployed with this cron previously registered, no further action is needed; Vercel automatically stops invoking a cron once its `vercel.json` entry is removed and the app is redeployed (handled in the final ship task).

- [ ] **Step 7: Commit**

```bash
git add vercel.json
git commit -m "chore: remove daily AI re-ranker cron — sort order is now a fixed rule, nothing left to rank"
```

---

### Task 23: Delete `TimerStrip`, update `app/layout.tsx`

**Files:**
- Delete: `components/dashboard/TimerStrip.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Confirm nothing else imports `TimerStrip`**

```bash
grep -rn "TimerStrip" /Users/brendanang/Documents/personal-os --include="*.tsx" --include="*.ts"
```

Expected: only `components/dashboard/TimerStrip.tsx` itself and `app/layout.tsx` (both handled in this task).

- [ ] **Step 2: Delete the file**

```bash
cd /Users/brendanang/Documents/personal-os
git rm components/dashboard/TimerStrip.tsx
```

- [ ] **Step 3: Update `app/layout.tsx`** — remove the import and usage

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TopRail from "@/components/dashboard/TopRail";
import CaptureBox from "@/components/dashboard/CaptureBox";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brendan OS",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <TopRail />
        <main className="mx-auto max-w-6xl p-6">{children}</main>
        <CaptureBox />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify `npm run build` succeeds**

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "chore: remove global TimerStrip — each task row now shows its own independent timer"
```

---

## Phase F — Ship

### Task 24: Full e2e verification + deploy

**Files:** none (verification + ops)

- [ ] **Step 1: Full local check**

```bash
cd /Users/brendanang/Documents/personal-os
npm test
npm run build
```
Expected: all tests pass, build succeeds with zero TypeScript errors, `/tasks` route present.

- [ ] **Step 2: Confirm migration 0003 has been applied**

```bash
source .env.local
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/tasks?select=id,category,status&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
If this errors with `column does not exist`, STOP — ask the user to apply the migration (print the SQL from Task 1 again) before proceeding with live verification. You can still deploy the code (Step 4) since the app degrades in a well-defined way... actually it will NOT degrade well without the migration — `category`/`status` columns must exist for the new UI to function at all. **Do not deploy without confirming migration 0003 is applied.** If it's not applied and the user is unavailable, stop here, report clearly what's blocked, and do not proceed to Steps 3+.

- [ ] **Step 3: Full local end-to-end flow** (background dev server, never foreground)

Walk through, using `x-api-secret` for auth bypass:
1. Create a task via `POST /api/capture` with real text — confirm real Claude classification lands with `category`/`key`/`status: 'not_started'` set correctly
2. `GET /api/tasks?status=all` — confirm the task appears with `active_timer: null`
3. `PATCH` the task's `category`, `status` (to `in_progress`), `key` — confirm each persists
4. Start a timer on it, confirm `active_timer` populates in the tasks list
5. Create a SECOND task, start ITS timer too — confirm BOTH tasks show `active_timer` simultaneously (proves per-task timers work, not global)
6. Stop both timers, confirm `actual_time_min` rolled up correctly on both
7. `PATCH {status: 'completed'}` on one — confirm `completed_at` auto-sets
8. Manually `PATCH {actual_time_min: 45}` — confirm the manual edit persists (not overwritten by any rollup)
9. Delete both test tasks — confirm `tasks`, `timer_sessions`, `raw_captures`, `audit_log` all show no trace of this test's ids afterward (query precisely by id, not a blanket count)
10. Kill the dev server, confirm no process remains

- [ ] **Step 4: Deploy**

```bash
npx vercel deploy --prod --scope admin-pocketcreatis-projects
```

- [ ] **Step 5: Production verification**

Repeat a condensed version of Step 3 against `https://personal-os-sigma-seven.vercel.app` (using `x-api-secret`): one real capture, one category/status/priority PATCH cycle, one timer start/stop, full cleanup, confirmed via direct Supabase queries.

- [ ] **Step 6: Report to the user**

Summarize: what changed (new design live at `/tasks`), what's confirmed working (list the specific things verified in Steps 3 and 5), any known gaps (the `SmartTab` adapter's no-op `onOpen`, from Task 20), and — since no browser/screenshot tooling was available during this build — an explicit, honest note that visual fidelity to the design handoff was verified by careful code-level comparison of style values against the README's exact tokens, NOT by an actual rendered screenshot, and the user should do a visual pass on next login and report anything that doesn't match.

---

## Post-implementation notes for the next planning session

- If the user wants Smart search to open the new `TaskDetailModal`/`TaskDetailSheet` again (closing the `onOpen` no-op gap from Task 20), that's a small follow-up: thread `activeTaskId`/`setActiveTaskId` from a shared context or lift `SmartTab` to consume the same `useTaskDashboard()` instance as the Board view instead of its own local `fetchTasks` call.
- `urgency`, `priority_score`, `rank_pinned` columns remain in the `tasks` table, unused. A future cleanup migration could drop them if desired — not urgent, doesn't affect correctness.
- The app-wide theme (Home, Review, login, TopRail) still uses the old dark oklch design system; only `/tasks` uses the new cream/gold system. Reskinning the rest of the app was explicitly deferred, per the brainstorming session.

