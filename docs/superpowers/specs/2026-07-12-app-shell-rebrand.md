# App Shell Rebrand — Design Spec

**Date:** 2026-07-12
**Owner:** Brendan Ang
**Status:** Approved (brainstormed in session — typography direction confirmed via visual companion mockup; user then granted autonomous execution and went offline, so this spec was finalized and the remaining minor calls made without a further review round)

## Purpose

The Task Dashboard redesign (2026-07-10) gave `/tasks` a light cream/gold visual system, but the rest of the app — `TopRail` (nav), `Panel` (used by Home and Login), `CaptureBox`, `SessionCard`, and the Login page — still use the original dark oklch "terminal" theme (`app/globals.css`'s `--ink-0`..`--ink-4`/`--accent`, Geist fonts, monospace tracked-out labels). The result is jarring: dark-and-green outside `/tasks`, light-and-gold inside it. This spec extends the Task Dashboard's palette and typography to the rest of the app so the whole product reads as one consistent product.

## Source of truth

The Task Dashboard's own already-shipped code (`components/tasks/*`) is the source of truth for tokens — not a new brand document. Two real Task Dashboard style values are reused verbatim:
- Background `#f3f1ec`, panel/card background `#fbfaf7`, primary text `#111`, muted text `rgba(17,17,17,.4)`–`rgba(17,17,17,.45)`, borders `rgba(17,17,17,.08)`–`rgba(17,17,17,.12)`, accent gold `#9a7a2e`.
- Typography: `'Archivo', sans-serif` (bold, uppercase-tracked, for headings/labels — see `TaskBoardDesktop.tsx` column headers, `TaskDetailModal.tsx`'s "Description" label), `'Inter Tight', sans-serif` (body/UI text — task titles, nav-equivalent labels), `ui-monospace, Menlo, monospace` (reserved specifically for clock/timer numeric readouts — `ClockInput.tsx`, `TaskBoardDesktop.tsx`'s `TimerCell`).

## Decisions

1. **Typography treatment: full match, terminal look retired.** Confirmed via visual companion (user picked "B" — the option that drops the monospace "BRENDAN OS" / tracked-out-uppercase terminal identity in favor of the Task Dashboard's actual Archivo/Inter Tight typography). The green `--accent` and dark backgrounds go away everywhere, not just recolored in place.
2. **Monospace is not banished — it's re-scoped.** The Task Dashboard's own convention uses `ui-monospace, Menlo, monospace` specifically for clock/timer numeric displays, nowhere else. The shared `.mono` utility class (`app/globals.css`) is kept as a class (still used by `components/tasks/TaskRow.tsx`, in scope note below) but its definition changes from `var(--font-geist-mono)` to the same system stack the Task Dashboard already uses (`ui-monospace, Menlo, monospace`) — no new font to load, and it now only ever renders on genuinely numeric/time-adjacent text (`SessionCard`'s `est Nm` readout, `TaskRow`'s tags/timestamps).
3. **Implementation approach: redefine the CSS variables, don't rewrite call sites.** Every still-dark component (`TopRail`, `Panel`, `CaptureBox`, `SessionCard`, `Login`, and — one layer further — `TaskRow`/`SmartView` via `var(--ok)`/`var(--warn)`/`var(--danger)`/`var(--ink-*)`) already consumes color exclusively through `app/globals.css`'s CSS custom properties, never hardcoded values (confirmed by reading all of them). Redefining the `:root` values in one place — rather than hardcoding new literals into every component the way the Task Dashboard itself does — means the palette change propagates automatically and can't miss a spot. Font swap works the same way: change what `--font-sans`/`--font-mono`-equivalent variables point to in `app/layout.tsx` + `globals.css`, and `body`'s base `font-family` picks it up everywhere by inheritance.
   - Trade-off acknowledged: this keeps two parallel styling conventions in the codebase (var()-driven shell vs. hardcoded-inline-style Task Dashboard). Not resolving that here — unifying them into one system is a bigger, separate refactor not asked for. This spec's job is visual consistency, not a styling-architecture consolidation.
4. **`--ok`/`--warn`/`--danger` need new values, not just reused as-is.** These are real semantic colors (over-estimate warning, key-task star, login/capture error text), currently tuned as light, saturated hues meant to pop against a *dark* background (`oklch(0.75 0.15 155)` etc.). Verbatim reuse would be low-contrast/washed-out against the new light `#f3f1ec`/`#fbfaf7` backgrounds. New values, chosen to read clearly on a light cream background while staying in the same warm, muted family as the gold accent (not neon/saturated, consistent with the Task Dashboard's restrained palette):
   - `--danger`: `#b3261e` (muted brick red — legible error text on cream, not a jarring pure red)
   - `--warn`: `#9a7a2e` (reuse the accent gold itself — `TaskRow`'s only `--warn` use is the ⭐ key-task marker, which the Task Dashboard already renders in this exact gold elsewhere)
   - `--ok`: `#4b7a4f` (muted sage green — reads as "on track" without clashing with the gold accent or looking like the old bright oklch green)
5. **Scope: shared shell + theme tokens only. `TaskRow.tsx`/`SmartView.tsx` are not touched directly.** Consistent with the Task Dashboard redesign's own explicit decision to leave those two files unmodified (they still serve the "Smart" search tab against the legacy `urgency`-based fields). They'll pick up the new colors and monospace-scoping automatically via the CSS variables they already reference — no direct edits to either file.
6. **`/review` doesn't exist yet.** `TopRail` links to it, but there's no `app/review/page.tsx` — it 404s today regardless of theme. Out of scope (nothing to restyle); the nav link itself still gets the new treatment like the other two tabs.

## Files changed

- `app/globals.css` — new `:root` values for `--ink-0..4`, `--accent`, `--ok`/`--warn`/`--danger`; `.mono` repointed to the system monospace stack; `@theme inline` font mappings updated.
- `app/layout.tsx` — swap `Geist`/`Geist_Mono` (`next/font/google`) for `Archivo`/`Inter_Tight`; update the CSS variable names threaded through (`--font-geist-sans` → `--font-archivo`, plus an Inter Tight variable) and `<html className>`.
- `components/dashboard/TopRail.tsx` — drop `.mono` from the title/nav labels/clock. Concrete target (from the approved mockup, values captured here so this doesn't depend on the ephemeral visual-companion file):
  - Title: drop the `●` bullet, title-case "Brendan OS" (not all-caps), `font: 800 15px 'Archivo', sans-serif`, color `#111`.
  - Nav labels: title-case ("Home"/"Tasks"/"Review", not all-caps), `font-family: 'Inter Tight', sans-serif`, `font-size: 13px`, no letter-spacing tracking. Inactive: `font-weight: 600`, `color: rgba(17,17,17,.45)`. Active tab: `font-weight: 700`, `color: #111`, `border-bottom: 2px solid #9a7a2e`, `padding-bottom: 2px` — a real active-state indicator, not just a lighter/darker opacity toggle like the current implementation.
  - Clock: drop monospace, `font: 500 12px 'Inter Tight', sans-serif`, `color: rgba(17,17,17,.4)`. Optionally prefix with the date (`Sun, Jul 12 · 00:37`) matching `TaskBoardDesktop`'s own header date format (`toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'})`) — not required, but consistent with how the Task Dashboard's own header treats this same kind of meta text; implementer's call whether to include it.
  - Bar itself: `background: #fbfaf7`, `border-bottom: 1px solid rgba(17,17,17,.08)` (replaces `var(--ink-2)` border — or these could be threaded through the redefined CSS variables per decision 3, implementer's choice which is cleaner given the actual current code).
- `components/ui/Panel.tsx` — title styling: `.mono uppercase tracking-[0.2em]` → Archivo bold uppercase tracked (matches Task Dashboard's own section-label convention, e.g. `TaskDetailModal`'s "Description" label).
- `components/dashboard/SessionCard.tsx` — no structural change expected (already fully `var()`-driven); verify visually once the theme is live that its layout still reads well against the new light background, since it was designed/tuned against the dark theme originally (e.g. `backdrop-blur-md` + `color-mix(in oklch, var(--ink-1) 90%, transparent)` glass effect — confirm this still looks intentional, not muddy, against a light backdrop; adjust the mix percentage if needed).
- `components/dashboard/CaptureBox.tsx` — same as SessionCard: no structural change expected, but re-check the `backdrop-blur` + `color-mix` glass effect against the new light background.
- `app/login/page.tsx` — no structural change expected (already fully `var()`-driven through `Panel`); spot-check the password input and button once live.

No direct edit needed (confirmed via repo-wide grep for every remaining `var(--ink`/`var(--accent`/`var(--ok`/`var(--warn`/`var(--danger` consumer): `app/page.tsx` (Home — just composes `SessionCard`+`Panel`, inherits automatically) and `components/tasks/SmartView.tsx` (inherits per decision 5, same as `TaskRow.tsx`).

## Verification

No behavior changes here (pure visual/theme), so no new automated tests. Verify via:
- `npm run build` clean.
- Since browser-based visual verification was unavailable earlier this session (Preview MCP tool couldn't start the dev server in this environment — filed separately for investigation), the implementer should attempt it again (it may have been an environment hiccup, not a permanent block) and get real screenshots of `/`, `/tasks`, `/login` at desktop and mobile widths. If it's still unavailable, fall back to careful code-level review of every changed style value against the Task Dashboard's actual tokens (same standard used for the Task Dashboard build itself), and say so explicitly in the report rather than silently skipping visual confirmation.
- Manual pass by Brendan once he's back — this is a purely visual change, so his own eyes on the real rendered pages are the actual acceptance test, not something a subagent report can fully substitute for.

## Explicitly out of scope

- Rewriting `TaskRow.tsx`/`SmartView.tsx` (Smart tab) — colors inherit automatically, structure/class usage untouched.
- Building the `/review` page — doesn't exist, not part of this change.
- Unifying the two parallel styling conventions (CSS-variable shell vs. hardcoded-inline Task Dashboard components) into one system.
- Production deploy — build/commit/verify locally, but hold the actual `vercel deploy --prod` for Brendan to confirm live, matching how every deploy earlier in this session was gated on his explicit go-ahead.
