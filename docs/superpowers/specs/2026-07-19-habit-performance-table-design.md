# Per-Habit Performance Table — Design

**Status:** Brainstormed interactively, mockup shown via visual companion and approved ("ok good for a start, let's build"). User then stepped away — proceeding autonomously per established precedent from earlier tonight.

## What

A table above the heatmap on `/habits` showing, per active habit: Week / Month / Year / All-time completion percentage. "All-time" starts from the habits feature's launch date (Saturday, 2026-07-18).

## The "smart" requirement

A habit created after launch must not be penalized for days before it existed. Each habit's effective tracking-start date is `max(habit.created_at date, 2026-07-18)`, and this same clamped start applies to week/month/year too, not just all-time — a habit created mid-week shouldn't show a deflated weekly score for days before it was created.

`habits.created_at` already exists in the schema (migration `0001_init.sql`) — no migration needed.

## One underlying fix required

`GET /api/habits` currently fetches `habit_logs` from `yearStart` (Jan 1 of the current year) through today. This happens to cover the launch date today (July is after January), but would silently break once the calendar rolls over to 2027 — `yearStart` would then be *after* the 2026-07-18 launch date, and "all-time" stats would be missing 2026 entirely. Fix: fetch from the fixed `HABITS_LAUNCH_DATE` constant instead of `yearStart`. This is strictly a superset of what's fetched today (no habits existed before launch anyway) and is what makes "all-time" actually mean all-time regardless of what year it currently is.

## Display

A small note ("· added N days ago") appears next to a habit's name only when its tracking-start is later than the natural period start being shown (i.e., only for genuinely new habits, only for the periods where clamping actually changed something) — so it's clear why a new habit's numbers might all read identically (100% because 3/3 days done, not because of a suspiciously perfect month). Mockup showed this scoped to "younger than the current week" as the visible threshold.

## Reuse

No new stats math — `calcCompletionPercent` (already tested) is called once per period per habit, with a clamped start date. New pure functions: `habitTrackingStart` (the clamping logic) and `calcHabitPeriodStats` (bundles all 4 periods for one habit), both in `lib/habitStats.ts`. A small `daysBetween` utility is added to `lib/dates.ts` for the age note.
