# Reflections Dashboard — Design

**Status:** Written and implemented autonomously while the user was away from keyboard, per explicit authorization ("heading out now for a bit... help me to build another dashboard calling it reflections... test for bugs as well"). No live Q&A was possible, so this doc makes and documents reasoned decisions instead of asking; the user should review on return. Same adaptation used for the Habits Dashboard earlier this session.

## 1. Origin and naming

The original master spec (`2026-07-08-personal-os-design.md`) envisioned this area as a "Review" tab combining daily journal entries with a separate weekly "seal week" review (wins/slipped/open loops/next week's top 3, with a `sealed_at` finalize timestamp — table `weekly_reviews`). The user's request tonight is narrower and uses a new name: a dashboard of dated reflections, integrated with Telegram. That's daily `journal_entries` only.

**Decision:** Build the daily-entries piece now, call it "Reflections" (the user's own word, taking precedence over the older spec's "Review" naming). Leave `weekly_reviews` / "seal week" untouched — it's a materially different, more structured feature (multiple named fields, a finalize/lock action, presumably a weekly cron for pattern insights per the master spec's P3 phase) that wasn't asked for tonight. Building it speculatively would be scope creep against an explicit "test for bugs, keep this stable" instruction — better to ship the requested piece solidly than two pieces shakily.

## 2. What already exists (verified, not assumed)

- `journal_entries` table (migration `0001_init.sql`, never used until now): `id, user_id, entry_date date, raw_text text, ai_summary text, mood text, focus text, created_at, unique(user_id, entry_date)`. No `updated_at` column.
- `lib/capture.ts`'s `processCapture()` already handles `classification.kind === 'journal'`: looks up today's entry (`localDateKey()`), appends `\n\n${text}` to `raw_text` if one exists, else inserts a new row. This is shared by both the Telegram webhook and the web capture box — both channels already write to the same place today.
- `lib/ai/classify.ts`'s system prompt already defines "journal" as "reflection/diary about the day," and its regex fallback already matches `/reflect(ing|ion)?/`. The classifier already treats "reflection" and "journal" as the same thing — no classifier changes needed for Telegram integration to work with the word "reflection."
- `app/api/telegram/webhook/route.ts` replies `📓 Journaled for today.${flag}` on a journal-kind capture.
- No existing API routes, pages, or components reference journal/review — the UI layer is a blank slate, same starting position as Habits before this session.

**Conclusion:** the "integrate with Telegram" half of the ask is already functionally wired up via the shared capture pipeline. This build adds the missing dashboard (view + native edit) and verifies the existing Telegram path end-to-end rather than rebuilding it.

## 3. Scope

**In scope:**
- A `/reflections` page: an always-visible editor for today's entry, plus a reverse-chronological list of past entries.
- Native create/edit of any day's entry from the dashboard.
- Read/verify the existing Telegram → `journal_entries` flow with a real webhook-shaped test request; cosmetic reply-text tweak ("Journaled" → "Reflection saved") for naming consistency.
- Conflict detection on save (see §5) — this is the direct answer to "I don't want to lose the data of my reflections."

**Out of scope (explicitly deferred, not forgotten):**
- `weekly_reviews` / seal-week UI.
- `mood` / `focus` fields — columns exist for future use but aren't surfaced; nothing in tonight's ask calls for capturing them yet.
- `ai_summary` — no summarization step exists yet; column stays unused.
- Delete. A personal diary is exactly the kind of data where an accidental destructive action is costly and was never asked for. Can be added later, deliberately, with a confirmation step, if wanted.
- Streaks / entry-count stats. The ask was "dates of the reflections," i.e. a dated list — not a stats surface. Habits already carries the stats treatment; duplicating that pattern here wasn't requested and adds surface area to something that's explicitly meant to be simple and stable.

## 4. Data flow

No migration needed — the table already fits. Two routes:

- `GET /api/reflections` — all entries for the user, ordered by `entry_date desc`. Personal, single-user app with a fresh table; no pagination needed yet (YAGNI — add if it ever matters).
- `GET /api/reflections/[date]` — fetch one entry fresh (not from any client cache). Used the instant the editor opens for a given date, so editing starts from the true current server state rather than a possibly-stale list snapshot.
- `PUT /api/reflections/[date]` — upsert on `(user_id, entry_date)`, body `{ raw_text, expected_previous_text? }`. See §5 for the conflict field.

## 5. The data-loss risk, and how this design addresses it

The one real, non-hypothetical risk here: `journal_entries` is written from **two independent channels** — Telegram (via the existing append pipeline) and this new native editor (a full-text overwrite). If the user opens today's entry in the dashboard, then sends a Telegram message that appends to it, then hits Save in the dashboard with their now-stale copy, a naive overwrite would silently discard the Telegram addition. That's precisely the scenario the user flagged.

**Decision:** optimistic concurrency check, not a full merge/CRDT system. When the editor loads a date's text, it remembers that exact string (`expected_previous_text`). On save, the server re-reads the current `raw_text` and compares it to `expected_previous_text` *before* writing:
- Match → proceed, upsert the new text.
- Mismatch → return `409` with the actual current text. The client shows the current server text (a full-text comparison, not a computed diff — unnecessary complexity for personal-length diary entries) alongside the user's in-progress edit, and offers **"Overwrite anyway"**, which resends the same `PUT` but *without* `expected_previous_text` (an unconditional write) — not a silent retry. The user has explicitly chosen to overwrite after seeing what they'd be discarding.

This doesn't solve the harder problem of two edits arriving genuinely concurrently mid-typing (full operational-transform merging), but that's not the realistic shape of this app — one person, one device typing at a time, occasionally texting the bot. Detecting "something changed since I started editing, look before you overwrite" is proportionate to the actual risk and is a well-understood, simple pattern (equivalent to an HTTP `If-Match` precondition). Full CRDT merging would be substantial complexity for a risk this small.

New-entry creation is the same code path: the client sends `expected_previous_text: ''` when it loaded an empty/nonexistent entry, so a Telegram message that created the row *after* the page loaded but *before* the user's first save is caught the same way.

## 6. UI

Same design system as Habits/Tasks (cream/gold/Archivo, no shared theme file — colors are hardcoded hex matching the CSS custom properties in `globals.css`, matching the existing convention rather than introducing a partial migration to `var()`).

- **Today card** (top, always visible): a textarea pre-filled with today's current text (fresh-fetched on mount), an explicit **Save** button, and a small status line (`Saved` / `Saving…` / a conflict warning per §5). An explicit button rather than silent autosave-on-blur (the pattern `TaskDetailModal` uses) — for a diary entry specifically, given the stated stability concern, an unambiguous "I pressed Save and it confirmed" beats an invisible auto-save the user has to trust happened.
- **Past entries** (below, excluding today so it isn't shown twice): reverse-chronological, each showing the date (`Fri, Jul 17`) and a preview of the text, click to expand into the same textarea-plus-Save editing pattern as the Today card, fresh-fetched at expand time (not from the list's cached copy).
- Empty state ("No reflections yet — write today's, or send one via Telegram.") matching Habits' empty-state tone.

## 7. Nav

Add "Reflections" as a third tab in `TopRail.tsx`, after Habits.

## 8. Testing plan (elevated rigor, per the explicit stability ask)

- Live API verification of the full cycle against the real DB (create, list, fetch-single, edit/overwrite), with cleanup after.
- Explicit test of the conflict path: write an entry, simulate a concurrent Telegram-style append via direct DB write, attempt a save with the now-stale `expected_previous_text`, confirm `409` + correct returned text + **confirm the DB was not overwritten**.
- A real webhook-shaped POST to `/api/telegram/webhook` (synthetic Telegram update payload, same technique as testing any other webhook handler) to exercise the actual production code path end-to-end, confirming a message still lands in `journal_entries` and appears correctly in the new dashboard.
- Browser verification, desktop and mobile: write today's entry, refresh, confirm persistence; edit a past entry; confirm the conflict warning actually surfaces in the UI when triggered.
- `tsc --noEmit`, `lint`, `build` after implementation, same as every other change this session.
- All test data cleaned up (deleted, verified empty) before considering this done.
