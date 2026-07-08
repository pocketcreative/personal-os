# Personal OS — Design Spec

**Date:** 2026-07-08
**Owner:** Brendan Ang
**Status:** Approved (brainstormed and confirmed in session)

## Purpose

A personal AI-driven operating system for tasks, habits, goals, and journaling, captured from anywhere via a Telegram bot and rendered on a private web dashboard. Adapted from the Miles Deutscher "Personal OS Build Cheat Sheet" with these deltas:

- **Removed:** Nutrition, Health tab, Finance Pulse / net worth, CRM "people" entities as a primary surface
- **Added:** Task timers (projected vs actual time, ADHD-aware), habit nudge engine with Telegram check-ins, an explicit AI layer that improves with use
- **Deferred:** Memory / pgvector brain layer (Phase 4), calendar card (Phase 4, optional)

## Success criteria

- Voice-note or text the Telegram bot from anywhere → task/journal/goal appears in the right place, correctly classified, within ~5 seconds
- Task board shows projected vs actual time per task; one tap starts/stops a live timer that survives refresh and device switches
- Habit nudges arrive on Telegram at configured times (SGT); tapping a button logs the habit without opening the dashboard
- Morning Telegram briefing lists AI-ranked top tasks + yesterday's habit score
- Dashboard never triggers AI on page load; AI runs on capture, cron, or explicit ask only
- Running cost in the ~$30/month ballpark at active use

## Stack (per the guide's defaults)

- **Frontend/server:** Next.js 15, App Router, TypeScript strict, Tailwind, dark glassmorphism styling per the UI/UX mockups (Community Asset 1)
- **Database:** Supabase Postgres (pgvector enabled but unused until Phase 4)
- **Hosting:** Vercel (serverless functions + cron)
- **AI:** Anthropic Claude (classification, ranking, insights) primary; OpenAI (Whisper transcription, fallback classifier, embeddings later)
- **Capture:** Telegram bot via BotFather → webhook → Vercel function
- **Auth:** single-password gate, HMAC-signed cookie; `x-api-secret` header for programmatic access
- **Timezone:** `Asia/Singapore` pinned via a `localDateKey()` helper used for every "what day is it" decision (guide bug #2)

## Tabs

**Home · Tasks · Review.** No Finance, Nutrition, Health, or Brain tabs (Brain arrives Phase 4).

- **Home:** Operator card, Session card ("today I will…" + top 3 key tasks + capture box), Habit tracker card, Goals card, live timer strip
- **Tasks:** full task board — Kanban / List / Smart views
- **Review:** daily journal entries + weekly review ("seal week") per mockup page 4

## Data model

Tables (all with `user_id`, RLS deny-all, service-role access from server routes):

- `tasks` — title, description, urgency (`today | this_week | this_month | someday`), `key` boolean, `priority_score`, `rank_pinned` boolean (manual drag pins rank against AI re-ranking), `time_estimate_min` (projected), `actual_time_min` (rolled up from timer sessions), tags text[], due_date, completed_at, timestamps
- `timer_sessions` — task_id FK, started_at, ended_at (null while running). Timer state lives in the DB, not the browser. At most one open session; starting a new timer closes the open one.
- `habits` — name, emoji, sub_tasks jsonb (e.g. filming = script/film/edit), schedule_days int[], nudge_time (nullable, SGT), nudge_message, sort_order, active
- `habit_logs` — habit_id FK, log_date, done_subtasks jsonb, completed boolean, source (`dashboard | telegram_nudge`)
- `nudge_snoozes` — habit_id FK, log_date, snoozed_until (transient; respected by the nudge cron)
- `goals` — scope (`week | month`), title, completed, sort_order; sentinel-date pattern so goals never auto-clear
- `journal_entries` — entry_date, raw_text (transcript), ai_summary, mood
- `weekly_reviews` — week_start, wins, slipped, open_loops, follow_ups, content_shipped, health_pattern, next_week_top3, sealed_at
- `raw_captures` — source, raw_text, audio_url, classification jsonb, override jsonb (user's tap-corrections — feeds classifier improvement), routed_to, routed_id
- `audit_log` — per guide
- `memory_chunks` — created in migration (vector(1536)) but unused until Phase 4

## Capture pipeline (guide Part 4, unchanged in shape)

Telegram webhook (`/api/telegram/webhook`): verify secret token + `TELEGRAM_USER_ID` → voice: download OGG, Whisper transcribe → classify via Claude (fallback OpenAI, last-resort regex): `{ kind: task|journal|goal, urgency, tags, summary, time_estimate_min? }` → write `raw_captures` → route to target table → audit log → reply with confirmation + inline urgency keyboard (Today / This Week / This Month / Someday / Key). Overrides are stored on the capture row.

Web fallback: floating capture box on the dashboard POSTs to `/api/capture`, same pipeline.

## Timers (custom)

- Each task row shows `est Xm → actual Ym ▶` chip; tap to start/stop
- Persistent timer strip at top of every page shows the running task + elapsed time
- One running timer max (ADHD-friendly; no orphaned timers)
- `actual_time_min` = sum of closed sessions; over/under vs estimate color-coded (ok/warn/danger tokens)
- Sessions API: `POST /api/timers/start`, `POST /api/timers/stop`, `GET /api/timers/active`

## Nudge engine (custom)

- Vercel cron hits `/api/nudges` every 15 minutes (auth: `CRON_SECRET`)
- Finds habits with `nudge_time` in the current window for today (SGT, schedule_days respected) not yet logged → Telegram message with inline buttons: ✅ Done / ⏭ Skip / 😴 Snooze 30m
- Button callbacks handled by the same webhook route; log straight to `habit_logs`
- Snooze writes a transient `nudge_snoozes` row the cron respects
- Morning briefing (~8:00 SGT, same cron infrastructure): today's AI-ranked top tasks, yesterday's habit score, open goals count

## AI layer — the "improves as I improve" loops

AI runs only on capture, cron, or explicit user ask. Never on page load.

1. **Capture intelligence (P1):** classifier prompt includes the user's ~20 most recent urgency overrides so classification converges on Brendan's judgment
2. **Daily re-prioritization (P1):** morning cron sends open tasks (+ due dates, age, key flags, recent completion/deferral behavior) to Claude → refreshed `priority_score`. Tasks with `rank_pinned` keep their position; AI ranks around them. List view + briefing use this order.
3. **Estimate calibration (P2):** with enough timer history, AI computes projected-vs-actual ratios by tag/type; suggests corrected estimates on new captures; weekly calibration trend note ("editing runs 1.8× your estimate, improving from 2.3×")
4. **Pattern insights (P3):** weekly cron reads journal + habit logs + timer data → pre-fills the Weekly Review (wins/slipped/patterns) with plain-language coaching
5. **Memory / ask-my-OS (P4):** embed all text artifacts to `memory_chunks`; `/ask` endpoint with citation-constrained answers

## Task views (Phase 1)

- **Kanban:** 4 urgency columns, drag to reorder (persists `priority_score`, sets `rank_pinned`) or re-tier
- **List:** flat list ordered by `priority_score` — checkbox · title · tags · timer chip · due date
- **Smart:** NL query box → Claude filters/orders open tasks
- View toggle persisted to localStorage; side-drawer edit on click; new tasks insert at top of tier

## Build phases

- **P0 Foundation:** scaffold, schema migration, auth gate, dashboard shell + Panel/TopRail components styled per mockups, deploy pipeline to Vercel
- **P1 Capture + Tasks + Timers:** Telegram webhook pipeline (voice + text), tasks CRUD API, Kanban/List/Smart views, timer sessions + strip, Session card, daily re-rank cron
- **P2 Habits + Nudges:** habits config + tracker card with sub-task groups, nudge cron + Telegram buttons, morning briefing, estimate calibration v1
- **P3 Goals + Journal:** goals card, journal routing from capture, Review tab + seal-week, weekly pattern insights
- **P4 Polish + Brain:** calendar card (iCal via ical.js, optional), backup export endpoint, mobile pass, memory layer + /ask

Each phase ends deployed and usable.

## Known constraints baked in (guide Part 8)

- ical.js, never node-ical/rrule (Vercel BigInt bundling bug)
- `localDateKey()` in `Asia/Singapore` for all day-boundary logic
- No empty `.catch(() => {})` — every fetch error surfaces
- `dirtyRef` guard so mount-time GETs never clobber fresh local edits
- Cache-bust bulk Supabase SELECTs (stale PostgREST edge cache)
- Validate classifier-returned IDs exist before writing; null on hallucination
- Loading-state branch before data render; no `!` across async boundaries

## Error handling

- Webhook always returns 200 to Telegram (retries otherwise); failures logged to `audit_log` and surfaced via a Telegram error reply
- Classifier failure chain: Claude → OpenAI → regex heuristic → default `task / this_week`, flagged `classification.low_confidence`
- Whisper failure: save capture with audio_url + error status, reply "couldn't transcribe, tap to retry"
- Cron endpoints idempotent (nudge dedupe on habit_id+date, briefing dedupe on date)

## Testing

- Unit tests for `localDateKey`, priority merge (pinned vs AI ranks), timer rollups, nudge-window selection
- Integration tests for the capture route with mocked Telegram/Whisper/Claude payloads
- Manual verification checklist per phase (deployed webhook round-trip, cron dry-run endpoint)

## Env vars

Per guide Appendix B minus finance/calendar (calendar added in P4): Supabase trio, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `AUTH_SECRET`, `DASHBOARD_PASSWORD`, `API_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_USER_ID`, `CRON_SECRET`, `USER_TIMEZONE=Asia/Singapore`, `USER_ID`.
