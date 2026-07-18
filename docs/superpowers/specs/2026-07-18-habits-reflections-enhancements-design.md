# Habits & Reflections Enhancements — Design

**Status:** Brainstormed interactively with the user present (visual companion used for the heatmap color-scale comparison and the new Reflections list/modal layout). User approved the design in chat and said "implement" — proceeding straight to the implementation plan per that explicit instruction, rather than a second file-review round-trip.

## 1. Habits — weekly stat

Add a third `StatChip` to `HabitsBoard.tsx`, "This week", placed before the existing "This month"/"This year" chips (order: Week, Month, Year — smallest granularity first). Computed the same way the other two already are: `calcCompletionPercent(habits, logs, weekStart, today)`, where `weekStart` is `data.weekDates[0]` (Monday of the current week, already returned by `GET /api/habits`). No new logic — this is one more call to an already-tested function.

## 2. Habits — heatmap color scale

**Root cause (confirmed by reading the code, not guessed):** `HabitsHeatmap.tsx`'s `cellColor(count: number)` buckets on a hardcoded absolute scale (0/1/2/3/4+). With 5 active habits today, a day with 4 done and a day with 5 done are indistinguishable (both hit the "4+" bucket), and the problem worsens with every habit added — confirmed live to the user via a side-by-side mockup (raw-count scale vs percentage scale), which they approved.

**Fix:** color each day by *percentage of that day's scheduled habits completed*, not raw count. Reuse `calcCompletionPercent` per-day — for each date `d` in the heatmap's range, call `calcCompletionPercent(activeHabits, logs, d, d)` (a single-day window). This is the exact same function already powering the month/year stats, applied once per calendar cell instead of once per period — no new percentage math, just a new call shape. Returns `null` when nothing was scheduled that day (e.g. before any habits existed); map `null` to the same "empty" gray already used for 0%.

`cellColor` changes signature from `(count: number)` to `(percent: number | null)`, keeping the same 5-step gold-opacity palette but bucketed by percentage: `null` or `0` → empty gray; `1-25` → lightest gold; `26-50` → next step; `51-75` → next step; `76-99` → next step; `100` → solid gold (the existing "maxed out" color, now meaning "everything scheduled was done," not "4 or more raw completions"). This is genuine pure logic worth a TDD pass (matching `dailyCompletionCounts`/`buildHeatmapWeeks`, which already have tests in `tests/habitHeatmap.test.ts`).

Archived (inactive) habits are excluded from the percentage's denominator, matching how `calcCompletionPercent` already filters `active: true` — an archived habit shouldn't make historical days look "incomplete" forever.

## 3. Reflections — data model change

New nullable column on the existing `journal_entries` table:

```sql
alter table journal_entries add column topic text;
```

The user needs to paste this into Supabase's SQL editor before the topic-dependent work can be tested live — this is the one hard dependency in the plan; everything else (heatmap, weekly stat, list/modal restructure, autosave, search) doesn't need it and can proceed independently.

Named `topic` in the database to match the UI exactly ("call it topic in both so it's easier to find" — user's words). Nullable/optional by design — not every reflection has a clear topic.

## 4. Reflections — interaction model change

**Current (built earlier tonight):** an always-open "Today" card at the top, plus past entries that expand inline in-place when clicked.

**New:** every entry — including today — renders as a **closed row** in one unified list: date, topic beside the date if set, a one-line preview of `raw_text` (or "(empty — click to write)"). Today sorts first naturally (most recent date), no special pinned treatment anymore. Clicking any row opens a **modal** (matching `TaskDetailModal`'s existing overlay pattern — the user confirmed this is what they meant by "popout"): a topic input and the reflection textarea, fresh-fetched the instant the modal opens (never trusting the list's cached preview for editing, same reasoning as before).

This removes `TodayCard` and `PastEntryRow` as separate concepts and replaces them with one row type + one modal component.

## 5. Reflections — autosave, and how it interacts with conflict detection

Debounced autosave (~1.5s after the user stops typing) on both the topic and text fields, sent as a single combined `PUT` per debounce tick. Additionally, an immediate flush-save fires the instant the modal closes, so text typed in the last moment before closing isn't lost waiting on the debounce timer. No manual Save button — a small inline status label instead ("Saving…" / "Saved").

**The conflict-detection mechanism built and live-tested earlier tonight (`expected_previous_text`, 409 on mismatch) is unchanged at the API layer.** What changes is the *client's* reaction to a 409, per the user's explicit choice:

- **Old behavior (explicit Save button):** show a blocking panel with the server's current text and an "Overwrite anyway" button, wait for the user to decide.
- **New behavior (autosave):** on a 409, automatically merge — take the server's current text, append the user's in-progress draft after it (same separator style as the existing Telegram-append convention: `\n\n`), update the textarea and the save-baseline to the merged result, and immediately retry the save. Show a small transient, non-blocking notice ("Merged a Telegram update in") that fades after a few seconds. Nothing is ever discarded; the difference from before is that the merge happens automatically rather than asking first — a deliberate tradeoff the user chose specifically to avoid autosave interrupting active typing.

`topic` is not conflict-checked — Telegram capture never writes to it (only `raw_text` is ever touched by the capture pipeline), so there's no concurrent-write risk to guard against for that field. It travels in the same `PUT` body as `raw_text` but is upserted unconditionally.

## 6. Reflections — search

A search input above the list, filtering the already-fetched entries client-side (no new API — entry volumes are small for a personal diary). Case-insensitive substring match against any of: the formatted display date (e.g. "Fri, Jul 17" — matching what's on screen, not the raw `YYYY-MM-DD` key), the topic, or the raw reflection text. An entry matching on any one of the three stays visible.

## 7. Testing

- `cellColor`'s new percentage-bucketing: TDD, added to `tests/habitHeatmap.test.ts`.
- Weekly stat: light live verification (it's a new call to an already-tested function, not new logic).
- `topic` column: live API verification after the user pastes the migration — create/update/fetch with a topic set and with it omitted (must stay nullable/optional).
- Autosave + merge-on-conflict: this is the highest-stakes new logic — live-test the full sequence (type text, wait past the debounce, confirm it autosaved; simulate a concurrent Telegram-style append *while* the modal is open and actively being typed into, confirm the merge happens automatically with no blocking UI and the final saved text contains both the concurrent addition and the user's draft; close the modal immediately after typing, before the debounce would have fired, and confirm the flush-on-close still captured it).
- Search: manual verification across all three match fields (date, topic, text).
- Full browser verification, desktop and mobile, of the new list + modal layout replacing the old Today-card + inline-expand.
