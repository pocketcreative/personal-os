# Habits Dashboard — Design Spec

## Context and process note

Brendan requested this feature by voice message at ~23:30 SGT, then went to sleep, explicitly asking for it to be built, tested, and deployed overnight for morning review. Per this project's standing instruction ("user instructions always take precedence" over skill defaults), this spec was written by exploring the existing codebase and the original build-guide philosophy already captured in `docs/superpowers/specs/2026-07-08-personal-os-design.md`, rather than through synchronous back-and-forth — Brendan was not available to answer clarifying questions. Decisions below are my best judgment from his voice message plus existing project conventions; anything I was not confident about is called out explicitly rather than guessed.

## Purpose

A simple daily habit checklist, separate from the Tasks page. Not the full nudge/Telegram-check-in engine described as "P2" in the original design doc — Brendan was explicit tonight: *"I really just want [to start] forming habits first, and I want that to be a checkbox system."* Nudges/cron reminders are a natural future addition, not part of this build.

## Scope

**In scope:**
- A new `/habits` page, visually matching the Task Dashboard's cream/gold/Archivo design system (the redesign that shipped for `/tasks` — not the older dark glassmorphism style referenced in the original 2026-07-08 spec, which predates that redesign).
- Weekly grid: habits listed down the left, checkboxes for each day of the current week on the right (matches Brendan's own description).
- Top-of-page monthly and yearly completion percentage.
- Add / rename / archive a habit.
- Toggle a habit done/not-done for a given day.

**Out of scope (not tonight):**
- Nudge cron, Telegram check-in buttons, morning briefing habit score — the full engine described in the original spec's "P2" phase. Bigger surface area than one overnight, unrequested tonight, and not safely testable without Brendan available to confirm nudge timing/wording.
- Sub-task breakdowns per habit (the schema's `sub_tasks`/`done_subtasks` jsonb columns support this, e.g. "filming = script → film → edit", but Brendan asked for a single checkbox per habit — sub-tasks would be unused complexity).
- Per-day scheduling UI (the schema's `schedule_days` column supports habits that only apply certain days — e.g. weekday-only). All four habits Brendan listed are daily, so new habits default to every day (`{0,1,2,3,4,5,6}`); a UI to edit that can follow later if he wants a non-daily habit.

## Data model — reusing what already exists

`habits` and `habit_logs` were already migrated in `supabase/migrations/0001_init.sql` (part of the original P0 schema) and currently have zero rows — this build needs **no new migration**, which matters given Brendan can't paste one into Supabase's SQL editor while asleep.

```
habits: id, user_id, name, emoji, sub_tasks jsonb, schedule_days int[],
        nudge_time, nudge_message, sort_order, active, created_at
habit_logs: id, user_id, habit_id FK, log_date date, done_subtasks jsonb,
            completed boolean, source, created_at
            UNIQUE(habit_id, log_date)
```

Used tonight: `habits.name`, `sort_order`, `active`; `habit_logs.log_date`, `completed`. `emoji`, `sub_tasks`, `nudge_time`/`nudge_message`, `done_subtasks`, `source` are left at their defaults, untouched by this build.

RLS is already deny-all on both tables (confirmed in migration 0001, same pattern as `tasks`) — server routes use `serviceClient()` exactly like the rest of the app.

## The fourth habit

Brendan listed four habits by voice. Three transcribed clearly:
1. Sleep at 11 PM
2. Exercise — gym or 10,000 steps
3. No social media before 6 PM

The third item transcribed as **"no holographic materials,"** which isn't a coherent habit — almost certainly a mis-transcription (most likely of "no pornographic materials," given the exact matching "-ographic" suffix and that it's a common habit-tracking goal), but personal/sensitive enough that guessing wrong and shipping it as a permanent label isn't acceptable. This build seeds only the three confirmed habits. Adding a fourth is one tap on the "+ Add habit" control once Brendan confirms the wording — flagged clearly in the handoff summary rather than silently decided.

## Stats calculation

Monthly / yearly percentage = completed `habit_logs` rows ÷ expected check-ins, where expected = (active habits) × (scheduled days elapsed so far in the period, inclusive of today). Using *elapsed* days (not the full month/year) so the percentage isn't artificially low on the 2nd of the month — standard habit-tracker convention. All current habits are daily, so this simplifies to `active habit count × days elapsed`, but the calculation itself respects `schedule_days` so it stays correct once non-daily habits exist.

Both stats key off `localDateKey()` (already the project's single source of truth for "what day is it," pinned to `Asia/Singapore`) — not raw UTC date math, consistent with the rest of the app.

## Page layout

New route `app/habits/page.tsx`, new component directory `components/habits/`. Reuses the Task Dashboard's exact design tokens (page bg `#f3f1ec`, card `#fbfaf7`, ink `#111`, gold `#9a7a2e`/`#c6a15b`, Archivo for headers, Inter Tight for body) via the same inline-style approach already used in `components/tasks/`. `TopRail`'s single-entry `TABS` array gets a second entry, `{ href: '/habits', label: 'Habits' }` — Home and Review stay hidden per the earlier explicit decision; this isn't reversing that, just adding a second visible tab alongside Tasks.

**Desktop:** a card matching `TaskBoardDesktop`'s container styling. Header row: title "Habits", monthly % and yearly % as two stat chips (matching the Archivo-bold-uppercase label style used elsewhere in this app), the current week's date range. Grid below: one row per active habit (name on the left), 7 checkbox columns (Mon–Sun) on the right, today's column visually highlighted. A lightweight "+ Add habit" row at the bottom.

**Mobile:** given Brendan's own description ("habits on the left, checkboxes on the right") assumes a grid/table shape rather than the card-stack pattern used for mobile tasks — at 7 columns plus a label column, a phone-width table needs horizontal scroll or compressed day columns. This build makes the grid horizontally scrollable on narrow viewports (label column pinned via `position: sticky; left: 0`, matching a standard responsive-table pattern) rather than restructuring into a different mobile-specific layout — keeps one component instead of two, and the grid genuinely is the requested shape on both surfaces, unlike the task board where card-stacking was the right mobile-specific call.

## API

- `GET /api/habits` — active habits + this week's + this month's + this year's logs in one response (avoids N+1 round trips for the stats).
- `POST /api/habits` — create `{ name }`, defaults `schedule_days` to every day.
- `PATCH /api/habits/[id]` — rename or archive (`active: false`).
- `PUT /api/habits/[id]/log` — upsert `{ log_date, completed }` on `habit_logs` (checkbox toggle); `ON CONFLICT (habit_id, log_date)` so re-toggling the same day updates rather than duplicates.

## Testing

- Pure logic gets unit tests per this project's TDD convention: the week-range helper (new addition to `lib/dates.ts`) and the monthly/yearly percentage calculation.
- API routes and the checkbox toggle flow get live-verified against the real Supabase instance (create a habit, toggle a few days, confirm stats move, clean up test rows) — same discipline as every other DB-touching change this session, per Brendan's explicit "remember the tests" instruction.
- Desktop and mobile layout verified in-browser before deploy, same as the drag-and-drop and popover fixes earlier tonight.
