# App Shell Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Task Dashboard's cream/beige/black/gold visual system and Archivo/Inter Tight typography to the rest of the app (nav, Home, Login, capture bar), retiring the old dark oklch/terminal theme.

**Architecture:** Every still-dark component (`TopRail`, `Panel`, `CaptureBox`, `SessionCard`, `Login`, and transitively `TaskRow`/`SmartView`) already consumes color exclusively through `app/globals.css`'s CSS custom properties (`--ink-0`..`--ink-4`, `--accent`, `--ok`/`--warn`/`--danger`) — never hardcoded values. Redefining those variables' values in one place propagates the new palette everywhere automatically. Fonts work the same way via `app/layout.tsx`'s `next/font/google` loading + `--font-*` variables. Bonus fix bundled in: Archivo/Inter Tight are referenced by literal name in 6 Task Dashboard component files but were never actually loaded anywhere in the codebase (no `next/font` call, no `@font-face`) — confirmed via repo-wide grep. Since `@font-face` rules are document-global in CSS (not scoped to where a class is applied), properly instantiating both fonts once in `layout.tsx` makes the Task Dashboard's existing literal `'Archivo'`/`'Inter Tight'` references resolve correctly for the first time too, with zero changes needed to those 6 files.

**Tech Stack:** Next.js 16 (Turbopack), `next/font/google`, Tailwind CSS v4 (`@theme inline`), plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-07-12-app-shell-rebrand.md`

---

### Task 1: Retheme `app/globals.css` colors only

**Files:**
- Modify: `app/globals.css`

Colors and fonts are deliberately split into separate tasks by *which file's pieces change together*, not by file: this task only touches the color-related lines. The font-related lines (`--font-sans`, `--font-mono`, `.mono`, body's `font-family`) stay pointed at Geist for now and move in Task 2 together with `layout.tsx` — Geist is still loaded at the end of this task, so nothing breaks in between. Splitting it the other way (all of `globals.css` in Task 1, `layout.tsx` in Task 2) would leave a broken intermediate build referencing a `--font-inter-tight` variable that doesn't exist until Task 2 lands.

- [ ] **Step 1: Read the current file** to confirm it still matches what's expected below (it was last touched in the original P0 build).

- [ ] **Step 2: Replace only the `:root` color values**

```css
:root {
  --ink-0: #f3f1ec; /* page background */
  --ink-1: #fbfaf7; /* card background */
  --ink-2: rgba(17, 17, 17, .12); /* borders */
  --ink-3: rgba(17, 17, 17, .45); /* muted text */
  --ink-4: #111111; /* primary text */
  --accent: #9a7a2e;
  --ok: #4b7a4f;
  --warn: #9a7a2e;
  --danger: #b3261e;

  --background: var(--ink-0);
  --foreground: var(--ink-4);
}
```

This replaces the existing `:root { ... }` block only. Leave `@theme inline`, `body { ... }`, and `.mono { ... }` exactly as they currently are (still referencing Geist) — those move in Task 2.

Note what changed and why: `--ink-*`/`--accent` go from dark oklch to the Task Dashboard's actual light palette (spec decision 1). `--ok`/`--warn`/`--danger` get new light-background-legible values, not verbatim reuse (spec decision 4 — the old values were tuned for a dark backdrop and would wash out on cream).

- [ ] **Step 3: Verify `npm run build` succeeds**

Expected: clean build. This task only changed color values referenced via `var(--ink-*)` etc. — no variable names changed, nothing structural, so this should build exactly as before, just with different resolved colors.

- [ ] **Step 4: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add app/globals.css
git commit -m "feat: retheme globals.css colors to Task Dashboard's cream/beige/black/gold palette"
```

---

### Task 2: Load Archivo + Inter Tight, retire Geist (layout.tsx + globals.css's font lines together)

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css` (font-related lines only — the rest was already handled in Task 1)

- [ ] **Step 1: Read both current files**

Confirm `app/layout.tsx` still matches the version documented in the redesign plan (`docs/superpowers/plans/2026-07-10-task-dashboard-redesign.md`, Task 23) — it should currently import `Geist`/`Geist_Mono` from `next/font/google` and use `TopRail`/`CaptureBox`. Confirm `app/globals.css`'s `@theme inline`/`body`/`.mono` blocks still reference Geist (Task 1 shouldn't have touched them).

- [ ] **Step 2: Replace the font imports and `RootLayout` in `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Archivo, Inter_Tight } from "next/font/google";
import TopRail from "@/components/dashboard/TopRail";
import CaptureBox from "@/components/dashboard/CaptureBox";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${archivo.variable} ${interTight.variable} h-full antialiased`}
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

This is why the bundled font-loading fix works without touching the Task Dashboard's own files: instantiating `Archivo(...)`/`Inter_Tight(...)` anywhere that's part of the compiled page injects their `@font-face` rules into the page globally — `@font-face` isn't scoped to the element the `.variable`/`.className` is applied to. The Task Dashboard's existing inline `font: "700 22px 'Archivo', sans-serif"` declarations will start resolving to these self-hosted files automatically once this lands, with no changes to `components/tasks/*`.

- [ ] **Step 3: Update the font-related lines in `app/globals.css`**

In the same commit, since these two files' font pieces are tightly coupled — update `@theme inline`, `body`, and `.mono` (the `:root` color block from Task 1 is untouched here):

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter-tight);
  --font-mono: ui-monospace, Menlo, monospace;
}

body {
  background: var(--ink-0);
  color: var(--ink-4);
  font-family: var(--font-inter-tight), system-ui, sans-serif;
}

.mono { font-family: ui-monospace, Menlo, monospace; }
```

`--font-mono` and `.mono` drop the Geist Mono reference entirely in favor of a plain system monospace stack — no font to load, matches what `ClockInput`/`TimerCell` already use for numeric readouts (spec decision 2).

- [ ] **Step 4: Verify `npm run build` succeeds**

Both files now reference only things that exist as of this same commit — `--font-inter-tight` is defined by `layout.tsx`'s `Inter_Tight({variable: "--font-inter-tight", ...})` in this same task. Confirm zero TypeScript errors and all routes generate.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: load Archivo + Inter Tight via next/font, retire Geist (also fixes Task Dashboard's fonts, which were never actually loading)"
```

---

### Task 3: Restyle `TopRail`

**Files:**
- Modify: `components/dashboard/TopRail.tsx`

- [ ] **Step 1: Read the current file** (documented in full in the spec's "Files changed" section — confirm it still matches before editing)

- [ ] **Step 2: Replace the component**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/', label: 'Home' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/review', label: 'Review' },
];

export default function TopRail() {
  const pathname = usePathname();
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () =>
      setTime(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Singapore', weekday: 'short', month: 'short', day: 'numeric',
      }).format(new Date()) + ' · ' + new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date()));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <nav
      className="flex items-center justify-between px-6 py-3"
      style={{ background: 'var(--ink-1)', borderBottom: '1px solid var(--ink-2)' }}
    >
      <span style={{ font: "800 15px 'Archivo', sans-serif", color: 'var(--ink-4)', letterSpacing: '-0.01em' }}>
        Brendan OS
      </span>
      <div className="flex gap-7">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 13,
                fontWeight: active ? 700 : 600,
                color: active ? 'var(--ink-4)' : 'var(--ink-3)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                paddingBottom: 2,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>{time}</span>
    </nav>
  );
}
```

Matches the spec's concrete TopRail values exactly (title-case labels, no `●` bullet, bold Archivo title, gold bottom-border active-state, Inter Tight throughout). The clock now shows date + time (`Sun, Jul 12 · 00:37`), matching the Task Dashboard's own header date format — this is the one small scope addition the spec flagged as "implementer's call"; included here since it's a two-line change and keeps the nav visually consistent with the Task Dashboard's own meta-text convention.

- [ ] **Step 3: Verify `npm run build` succeeds**

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/TopRail.tsx
git commit -m "feat: restyle TopRail — Archivo/Inter Tight typography, gold active-tab indicator"
```

---

### Task 4: Restyle `Panel`

**Files:**
- Modify: `components/ui/Panel.tsx`

- [ ] **Step 1: Read the current file** to confirm it still matches the version documented in the spec.

- [ ] **Step 2: Replace the title styling**

```tsx
export default function Panel({
  title, right, children, className = '',
}: {
  title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section
      className={`rounded-xl border p-4 backdrop-blur-md ${className}`}
      style={{ borderColor: 'var(--ink-2)', background: 'color-mix(in oklch, var(--ink-1) 85%, transparent)' }}
    >
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between">
          {title && (
            <h2 style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'var(--ink-3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              {title}
            </h2>
          )}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
```

Only the `<h2>` title changes (`.mono text-xs uppercase tracking-[0.2em]` → Archivo bold uppercase tracked, matching `TaskDetailModal`'s "Description" label styling exactly). Everything else — the `color-mix` glass background, border, layout — is unchanged; `Panel` itself doesn't have the glass-blur issue (Task 5 checks `SessionCard`/`CaptureBox` specifically, which have a stronger blur treatment) but keep an eye on it during Task 5's visual pass regardless.

- [ ] **Step 3: Verify `npm run build` succeeds**

- [ ] **Step 4: Commit**

```bash
git add components/ui/Panel.tsx
git commit -m "feat: restyle Panel title — Archivo bold uppercase, matching Task Dashboard section labels"
```

---

### Task 5: Visual verification pass — attempt real screenshots, fall back to code review

**Files:** none (verification only)

- [ ] **Step 1: Attempt browser-based visual verification**

Try the `mcp__Claude_Preview__preview_start` tool (name it after creating `.claude/launch.json` at the harness's session cwd — NOT the project directory — pointing `runtimeArgs` at `["--prefix", "/Users/brendanang/Documents/personal-os", "run", "dev"]`, port 3000; free port 3000 first if something else is listening). This failed to actually bring up a server earlier in this project's history (reported success but nothing listened) — a separate background task was filed to investigate why (`task_e8baad8d`, if still open). It may have been an environment hiccup rather than a permanent block — worth one real attempt (2-3 minutes budget) before falling back.

If it works: log in (the `x-api-secret` header bypasses API auth but NOT page-level middleware for `/`, `/tasks`, `/login` — you need a real session; use `preview_fill`/`preview_click` against the login form with `DASHBOARD_PASSWORD` from `.env.local`, or navigate directly if a session cookie can be set via `preview_eval`), then `preview_screenshot` at `preset: "desktop"` and `preset: "mobile"` for `/` (Home) and `/login` (log out first, or open a fresh incognito-style context if the tool supports it — check `/login` unauthenticated). Also screenshot `/tasks`'s **Smart** tab specifically (click the "Smart" tab, not the default "Board" tab) — this renders `SmartView.tsx`/`TaskRow.tsx`, which this plan deliberately does not edit (spec decision 5); a screenshot here empirically confirms those files really did inherit the new palette automatically via the CSS variables, rather than just assuming it. The Board tab was already visually redesigned in the earlier session and is out of scope for new screenshots, though a quick one confirms nothing regressed.

If it does NOT work within the budget: fall back to careful code-level review — read the final `TopRail.tsx`, `Panel.tsx`, `globals.css`, `app/page.tsx`, `app/login/page.tsx`, `components/dashboard/SessionCard.tsx`, `components/dashboard/CaptureBox.tsx` and confirm every color/font value traces back to a Task-Dashboard-sourced token from the spec (no stray old dark-theme literals, no leftover `--font-geist-*` references). State explicitly in your report which path you took and why — do not silently skip visual confirmation without saying so.

- [ ] **Step 2: Check the two components the spec flagged as needing a closer look**

`SessionCard.tsx` and `CaptureBox.tsx` both use a `backdrop-blur-md` + `color-mix(in oklch, var(--ink-1) N%, transparent)` glass effect, originally tuned against the dark theme. Read both files' current `color-mix` percentages. If you got real screenshots in Step 1, judge directly whether the glass effect still looks intentional (a soft frosted panel) rather than muddy/low-contrast against the new light `#f3f1ec`/`#fbfaf7` backgrounds — adjust the mix percentage if it looks off (small tweak, e.g. dropping from 90%/85% opacity toward 75-80% if it reads too flat, or the reverse if it looks too transparent) and re-screenshot to confirm. If you fell back to code-only review in Step 1, flag this specific check as unverified in your report rather than guessing at a numeric adjustment blind.

- [ ] **Step 3: Confirm no stray references remain**

```bash
cd /Users/brendanang/Documents/personal-os
grep -rn "font-geist\|oklch(0\.1[27]" app components --include="*.tsx" --include="*.ts" --include="*.css"
```

Expected: no output. (The oklch pattern targets the old dark `--ink-0`/`--ink-1` hue ranges specifically — a hit here means something still references the retired dark values directly instead of through the now-redefined variables.)

- [ ] **Step 4: Run `npm run build` and `npm test` one final time**

Expected: build clean, all existing tests still pass (this is a pure styling change — no test file is expected to change or be added; if any test fails, that's a real regression to investigate, not something to explain away).

- [ ] **Step 5: If Step 2 required a `color-mix` adjustment, commit it**

```bash
git add components/dashboard/SessionCard.tsx components/dashboard/CaptureBox.tsx
git commit -m "polish: adjust glass-panel opacity for the light theme"
```

Skip this commit if no adjustment was needed.

---

## Post-plan note

Production deploy is explicitly out of scope for this plan (per the spec) — stop after Task 5, fully committed and verified on `main`, and wait for Brendan to review live before deploying. Do not run `vercel deploy --prod`.
