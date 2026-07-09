# Task Dashboard Redesign — Design Spec

**Date:** 2026-07-10
**Owner:** Brendan Ang
**Status:** Approved (brainstormed and confirmed in session; user then requested pixel-close fidelity to the provided design files for both desktop and mobile)

## Purpose

Replace the Tasks page's current List/Kanban/Smart-view system with a single, high-fidelity redesign matching a provided design handoff (`~/Downloads/design_handoff_task_dashboard/`): a desktop table view and a responsive mobile card view, sharing one data model and interaction set. The previous design (dark oklch glassmorphism, priority_score-based sorting, drag-and-drop Kanban) was reported hard to use. This redesign trades that model for one with a fixed, predictable auto-sort rule, richer per-task fields (category, status), and independent per-task timers.

## Source of truth for visual/interaction fidelity

`~/Downloads/design_handoff_task_dashboard/README.md`, `Task Dashboard.dc.html` (desktop), `Task Dashboard Mobile.dc.html` (mobile) — read in full during brainstorming. `ios-frame.jsx` is presentation-only (phone bezel), explicitly excluded from implementation per the README. Recreate pixel-close per the README's stated "high-fidelity" mandate: exact colors, fonts, spacing, and interaction patterns as documented below.

## Decisions locked during brainstorming

1. **Timers: multiple simultaneous, per-task.** Retiring the one-timer-max invariant (was an earlier ADHD-aware design choice; user explicitly chose to change it now). Each task row has its own independent start/pause; no auto-stop of other timers.
2. **Priority: binary, reusing `key`.** No new column — `key: true` = "TODAY" pill, `key: false` = "—" / "No priority". The old 4-tier `urgency` field is no longer used for sorting/display; the column and its values are left in place (non-destructive) but functionally dead.
3. **Status: new field, user-settable.** `not_started | in_progress | completed`, directly settable via popover — not derived from timer activity. Marking `completed` also sets `completed_at` (keeps existing open/done API filtering intact) and auto-stops any running timer for that task, backfilling `actual_time_min` from the elapsed timer if it's still zero.
4. **Category: new field.** `personal | business`, its own column (not folded into `tags`).
5. **Kanban view: removed.** No more drag-and-drop; sort order is a fixed, always-applied rule (below), not user-reorderable.
6. **Smart search: kept**, unchanged, as its own tab alongside the new main task view.
7. **Daily AI re-ranker cron: removed entirely.** Nothing left to rank once sort order is rule-based rather than score-based.
8. **Capture classifier: updated** to output `category` (personal/business guess) and binary `priority` (today/dash) instead of 4-tier `urgency`; `status` always defaults to `not_started` on capture.
9. **Theme scope: Tasks page only.** Home, Review, login, and TopRail keep the current dark theme for now — no app-wide reskin in this pass.

## Data model changes

New migration `0003_task_dashboard_redesign.sql`:

```sql
alter table tasks
  add column category text not null default 'personal'
    check (category in ('personal', 'business')),
  add column status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed'));

-- Backfill: any task that already has completed_at set should read as completed,
-- not the new column's default.
update tasks set status = 'completed' where completed_at is not null;

-- Per-task (not per-user) one-open-session guarantee: a single task can't have
-- two overlapping timer sessions, but different tasks can each run independently.
-- Supersedes migration 0002's per-user index, which was never applied to prod.
create unique index timer_sessions_one_open_per_task_idx
  on timer_sessions (task_id)
  where ended_at is null;
```

`urgency`, `priority_score`, `rank_pinned` on `tasks`: left in the schema, unused by any application code after this change. Not dropped (avoids a destructive migration for marginal benefit); a future cleanup pass can remove them if desired.

Migration `0002_timer_sessions_one_open.sql` (per-user index) is superseded and was never applied to production — no conflict, no need to drop it first, since `0003`'s per-task index is a different, compatible constraint shape.

## What's removed

- `components/tasks/KanbanView.tsx` — deleted
- `app/api/cron/rerank/route.ts`, `lib/priority.ts`, `tests/priority.test.ts` — deleted
- `vercel.json`'s cron entry — removed (file becomes empty of crons, or removed entirely if no crons remain)
- One-timer-max enforcement in `lib/timers.ts` (`closeOpenSessions` global-scope logic) and `app/api/timers/start/route.ts`'s retry-on-conflict logic — replaced with per-task equivalents
- `components/dashboard/TimerStrip.tsx` and its usage in `app/layout.tsx` — removed; each task row now shows its own live timer inline, so a single global "currently running" banner no longer makes sense
- `components/tasks/TaskBoard.tsx`, `components/tasks/TaskRow.tsx`, `components/tasks/TaskDrawer.tsx`, `lib/clientTasks.ts`'s view-toggle logic — replaced by the new component set below (some logic, like optimistic-update patterns, is reused/ported, not literally deleted-and-rewritten from scratch)

`components/tasks/SmartView.tsx` and `app/api/tasks/smart/route.ts` — **kept as-is**, still reachable via a tab.

## New Tasks page architecture

**Two tabs**: "Board" (the new design) and "Smart" (existing NL search, unchanged). Default tab: Board.

**`useTaskDashboard()` hook** (`lib/useTaskDashboard.ts`) — the single state owner, replacing `TaskBoard`'s role:
- Fetches **all** tasks regardless of `completed_at` — unlike the old app's open/done split, the new design keeps completed tasks permanently visible in the same list, just always sorted last (see sort rule below). `GET /api/tasks` gets a third mode, `?status=all`, used exclusively by this page; the existing `open`/`done` modes are untouched (still used by `SmartView` and anything else that wants the old split).
- Exposes: `tasks`, mutation functions (`updateCategory`, `updateStatus`, `updatePriority`, `updateExpected`, `updateActual`, `updateName`, `updateDescription`, `startTimer`, `stopTimer`, `deleteTask`), filter state (`statusFilters`, `priorityFilters`), and the active-task-modal state (`activeTaskId`)
- Applies the fixed sort rule client-side on every render, matching the mockup's `taskRank()` exactly:
  1. in_progress + today priority
  2. not_started + today priority
  3. in_progress (no today priority)
  4. not_started (no today priority)
  5. completed (always last, regardless of priority)
- Applies status/priority filters (independent multi-select sets; empty set = show all) before sorting
- Carries forward the `dirtyRef`/`pendingRemovalRef` optimistic-update-race protections from the current `TaskBoard` (proven necessary by two real bugs found in review during the original build) — same pattern, new field surface

**`TaskBoardDesktop`** (`components/tasks/TaskBoardDesktop.tsx`, rendered ≥768px) — the 7-column CSS grid table:
- Exact column widths, gap, divider styling, header/row borders per the README's Layout section
- Column-header click-to-filter popovers for Status and Priority (multi-select checklists), header text turns gold when a filter is active
- Per-row: Task name (click → opens modal), Category popover, Status popover (dot + label), Priority popover (TODAY pill / —), Exp./Actual time `ClockInput`s, Timer (hourglass toggle + live readout)
- Full-screen invisible overlay (`position:fixed;inset:0`) closes any open popover on outside click; clicking inside a popover stops propagation

**`TaskBoardMobile`** (`components/tasks/TaskBoardMobile.tsx`, rendered <768px) — the card stack:
- Fixed (non-scrolling) header: title + date + two filter chips (Status, Priority)
- Scrolling card stack, `12px` gap; list does not stretch to fill remaining screen height when short
- Card anatomy per the README: name+timer row, wrapping chip row (category/status/priority popovers), divider, side-by-side Expected/Actual `ClockInput`s
- Tapping a task name opens a **bottom sheet** (not a centered modal) — slides up, rounded top corners, drag-handle indicator

**Shared components**:
- `ClockInput` (`components/tasks/ClockInput.tsx`) — HH:MM:SS text input; typing digits fills right-to-left (strip non-digits, take last 6 digits, split HH/MM/SS, clamp MM/SS to 0–59), monospace font, matches both desktop and mobile styling via a size prop
- `FieldPopover` (`components/tasks/FieldPopover.tsx`) — the reusable click-to-open, click-outside-to-close, single-select popover used for Category/Status/Priority everywhere (desktop cells, mobile chips, header filters differ slightly — header filters are multi-select checklists, a distinct but related variant)
- `TaskDetailModal` (`components/tasks/TaskDetailModal.tsx`, desktop) / `TaskDetailSheet` (`components/tasks/TaskDetailSheet.tsx`, mobile) — editable name + description textarea, per the README's two layouts

**`app/tasks/page.tsx`** — renders a tab switcher (Board / Smart) and picks `TaskBoardDesktop` vs `TaskBoardMobile` via a `useMediaQuery('(min-width: 768px)')` hook (new, `lib/useMediaQuery.ts`) rather than pure CSS breakpoints, since the two layouts are different enough (grid table vs card stack, modal vs sheet) to warrant a JS-level split rather than one component with responsive CSS throughout.

## Timer behavior

- `POST /api/timers/start` now takes `task_id` and starts a session for that task only — no longer closes other tasks' open sessions.
- `POST /api/timers/stop` now takes `task_id`, closes that task's open session, and rolls up `actual_time_min` from summed closed sessions for that task (reuses `sumSessionMinutes`/`rollupTask` logic from `lib/timers.ts`, now per-task-scoped rather than per-user).
- `GET /api/timers/active` becomes `GET /api/timers/active?task_id=X` or is replaced by embedding each task's own active-session state directly in the tasks list response (join `timer_sessions` where `ended_at is null` per task) — the latter is simpler for the new UI, which needs every visible row's timer state at once, not just one global "the" active timer. Chosen: embed per-task active session state in `GET /api/tasks`.
- `actual_time_min` remains directly editable via `ClockInput` at any time (manual edit wins, last-write-wins — matches the mockup's model where `actualSeconds` isn't continuously synced to `timerSeconds` except on marking Completed).
- Client-side live tick: each row with a running timer ticks its own displayed `HH:MM:SS` every second via `Date.now() - started_at` math (same pattern as the old `TimerStrip`, just instantiated per-row now via a small `useLiveTimer(startedAt)` hook), not a re-fetch.

## Capture pipeline changes

`lib/ai/classify.ts`: `Classification` interface changes `urgency: Urgency` → `priority: 'today' | 'dash'`; adds `category: 'personal' | 'business'`. `SYSTEM_PROMPT`, `parseClassification`, `regexClassify` all updated accordingly. `KINDS`/`PRIORITIES`/`CATEGORIES` enum arrays replace `URGENCIES`.

`lib/capture.ts`: `processCapture`'s task-insert branch sets `key: classification.priority === 'today'`, `category: classification.category`, `status: 'not_started'` instead of the old `urgency`/`priority_score` fields. `TIER_BASE` constant removed (no longer meaningful).

`app/api/telegram/webhook/route.ts`: `urgencyKeyboard()` → `taskActionKeyboard()`, offering "Mark Today" / "Mark —" and category toggle instead of the 4-tier urgency buttons — mirrors the new binary model. `URGENCY_LABELS` removed.

## Design tokens (Tasks page scope only)

Per the README's Design Tokens section — colors (`#f3f1ec` page bg, `#fbfaf7` card bg, `#111` ink, gold `#9a7a2e`/`#c6a15b`, yellow `#eab308`/`#a16207`, green `#2f9e44`/`#227a37`), typography (Archivo 700–800 for headers, Inter Tight 400–600 for body, monospace for clock digits), spacing, radius, and shadow values — applied via inline styles or a scoped CSS module local to the new Tasks components, **not** merged into the app's global `--ink-*` custom properties (which stay dark-themed for the rest of the app per decision #9).

## Testing

- Unit tests: `ClockInput`'s digit-fill-right-to-left parsing (pure function, TDD — mirrors the mockup's `parseClockInput`), the sort-rule function (`taskRank`, pure, TDD), `regexClassify`'s updated category/priority heuristics
- Live verification (per this project's established discipline): full CRUD cycle against the live Supabase DB for every new field (category, status, per-task timer start/stop/rollup), classifier live-tested with the real Anthropic key, all test data cleaned up and confirmed via direct table queries after every task
- Manual: since no browser tooling is available in this session, visual fidelity is verified by careful line-by-line comparison of implemented component code against the design handoff's exact style values, plus `npm run build`/`npm test` passing — flagged honestly as not a substitute for an actual visual screenshot comparison, which the user should do on next login

## Error handling

Same conventions as the rest of the codebase: every fetch guarded with `.catch()` and `console.error`, optimistic UI updates with resync-on-failure, `requireEnv` for required secrets, graceful AI-classifier fallback chain preserved (Claude → OpenAI → regex) with the field surface changed but the resilience shape identical.

## Migration application

`0003_task_dashboard_redesign.sql` cannot be applied by the assistant directly (no raw DB write access, same constraint as migrations 0001/0002) — requires a manual paste into Supabase's SQL Editor. The application code will be built and tested against a schema that assumes this migration has been applied; live end-to-end testing of the new fields is blocked until the user applies it.
