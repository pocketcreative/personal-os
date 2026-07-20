# Per-Habit Performance Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A table above the Habits heatmap showing each habit's Week/Month/Year/All-time completion percentage, correctly clamped so a habit never gets penalized for days before it existed (whether that's the app's July 18 launch, or a habit created later).

**Architecture:** No migration needed — `habits.created_at` already exists. New pure functions in `lib/habitStats.ts` (`habitTrackingStart`, `calcHabitPeriodStats`) reuse the already-tested `calcCompletionPercent`, just with a clamped start date. One underlying fix: `GET /api/habits` currently fetches logs from `yearStart`, which only happens to cover the launch date because it's still 2026 — switching to a fixed `HABITS_LAUNCH_DATE` constant makes "all-time" actually mean all-time once the year rolls over. As a natural extension of the same fix, the *existing* Week/Month/Year stat chips also get clamped to the launch date, correcting a latent unfairness where they've been counting July 1-17 (before any habit existed) as expected-but-uncompletable days.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`serviceClient()`), Vitest.

**Design spec:** `docs/superpowers/specs/2026-07-19-habit-performance-table-design.md` — read this first, especially the "smart" clamping rationale, approved via a visual-companion mockup.

---

### Task 1: `habitTrackingStart`, `calcHabitPeriodStats`, `daysBetween` (TDD)

**Files:**
- Modify: `lib/habitStats.ts`
- Modify: `lib/dates.ts`
- Modify: `tests/habitStats.test.ts`
- Modify: `tests/dates.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/dates.test.ts` (read the file first — it already has tests for `localDateKey` etc., do not remove them):

```ts
import { daysBetween } from '@/lib/dates';

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2026-07-18', '2026-07-18')).toBe(0);
  });
  it('returns a positive count when b is after a', () => {
    expect(daysBetween('2026-07-18', '2026-07-21')).toBe(3);
  });
  it('returns a negative count when b is before a', () => {
    expect(daysBetween('2026-07-21', '2026-07-18')).toBe(-3);
  });
  it('handles a month boundary', () => {
    expect(daysBetween('2026-07-30', '2026-08-02')).toBe(3);
  });
});
```

Append to `tests/habitStats.test.ts` (read the file first — it already has tests for `calcCompletionPercent`, do not remove them):

```ts
import { habitTrackingStart, calcHabitPeriodStats, HABITS_LAUNCH_DATE } from '@/lib/habitStats';

describe('habitTrackingStart', () => {
  it('returns the launch date when the habit was created before launch', () => {
    expect(habitTrackingStart('2026-07-15T00:00:00Z', '2026-07-18')).toBe('2026-07-18');
  });
  it('returns the habit\'s own creation date when created after launch', () => {
    expect(habitTrackingStart('2026-07-21T00:00:00Z', '2026-07-18')).toBe('2026-07-21');
  });
  it('returns the launch date when the habit was created exactly on launch day', () => {
    expect(habitTrackingStart('2026-07-18T09:30:00Z', '2026-07-18')).toBe('2026-07-18');
  });
  it('defaults to HABITS_LAUNCH_DATE when no launchDate argument is given', () => {
    expect(habitTrackingStart('2026-01-01T00:00:00Z')).toBe(HABITS_LAUNCH_DATE);
  });
});

describe('calcHabitPeriodStats', () => {
  const periods = { weekStart: '2026-07-20', monthStart: '2026-07-01', yearStart: '2026-01-01', today: '2026-07-25' };

  it('a habit that existed since launch: week clamps to weekStart, but month/year/allTime clamp to launch (2026-07-18) since that is LATER than their natural period start', () => {
    const habit = { id: 'h1', schedule_days: [0, 1, 2, 3, 4, 5, 6], active: true, created_at: '2026-07-18T00:00:00Z' };
    const logs = [
      { habit_id: 'h1', log_date: '2026-07-18', completed: true },
      { habit_id: 'h1', log_date: '2026-07-19', completed: true },
      { habit_id: 'h1', log_date: '2026-07-20', completed: true },
      { habit_id: 'h1', log_date: '2026-07-21', completed: false },
      { habit_id: 'h1', log_date: '2026-07-22', completed: true },
      { habit_id: 'h1', log_date: '2026-07-23', completed: true },
      { habit_id: 'h1', log_date: '2026-07-24', completed: true },
      { habit_id: 'h1', log_date: '2026-07-25', completed: true },
    ];
    const stats = calcHabitPeriodStats(habit, logs, periods);
    // week: periods.weekStart (2026-07-20) is already later than the habit's
    // trackingStart (2026-07-18), so it wins unclamped -- range 07-20..25 (6
    // days), 5 of 6 completed (07-21 is false) -> 83%.
    expect(stats.week).toBe(83);
    // month/year: their natural starts (07-01, 01-01) are EARLIER than
    // trackingStart (07-18), so trackingStart wins -- range 07-18..25 (8
    // days), 7 of 8 completed -> 88%. This is the exact latent-unfairness
    // case Task 3 also fixes for the existing aggregate stat chips.
    expect(stats.month).toBe(88);
    expect(stats.year).toBe(88);
    expect(stats.allTime).toBe(88);
  });

  it('a habit created mid-week after launch is clamped on every period, matching the approved mockup example', () => {
    const habit = { id: 'h2', schedule_days: [0, 1, 2, 3, 4, 5, 6], active: true, created_at: '2026-07-23T12:00:00Z' };
    const logs = [
      { habit_id: 'h2', log_date: '2026-07-23', completed: true },
      { habit_id: 'h2', log_date: '2026-07-24', completed: true },
      { habit_id: 'h2', log_date: '2026-07-25', completed: true },
    ];
    const stats = calcHabitPeriodStats(habit, logs, periods);
    // Every period clamps to 2026-07-23 (the habit's own creation date, later
    // than weekStart/monthStart/yearStart/launch) -- 3 of 3 days completed,
    // so every column reads 100%, not a deflated score for days it didn't exist.
    expect(stats.week).toBe(100);
    expect(stats.month).toBe(100);
    expect(stats.year).toBe(100);
    expect(stats.allTime).toBe(100);
  });

  it('a weekday-only habit is unaffected by clamping when its schedule already excludes the clamped days', () => {
    const habit = { id: 'h3', schedule_days: [1, 2, 3, 4, 5], active: true, created_at: '2026-07-18T00:00:00Z' };
    const logs = [
      { habit_id: 'h3', log_date: '2026-07-20', completed: true }, // Monday
      { habit_id: 'h3', log_date: '2026-07-21', completed: true }, // Tuesday
    ];
    // periods.weekStart (2026-07-20) is a Monday; only weekdays count
    const stats = calcHabitPeriodStats(habit, logs, { ...periods, today: '2026-07-21' });
    expect(stats.week).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- dates habitStats`
Expected: FAIL — `daysBetween`, `habitTrackingStart`, `calcHabitPeriodStats`, `HABITS_LAUNCH_DATE` are not exported yet.

- [ ] **Step 3: Implement**

Append to `lib/dates.ts`:

```ts
/** Whole calendar days from `a` to `b` (positive if b is later), via pure Date.UTC arithmetic. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}
```

Append to `lib/habitStats.ts`:

```ts
/** The date the habits feature itself launched -- nothing was tracked before this, for any habit. */
export const HABITS_LAUNCH_DATE = '2026-07-18';

/**
 * The earliest date a habit's stats should ever consider: the later of the
 * habits-launch date and the habit's own creation date, so a habit added
 * after launch isn't penalized for days before it existed.
 */
export function habitTrackingStart(habitCreatedAt: string, launchDate: string = HABITS_LAUNCH_DATE): string {
  const createdDateKey = habitCreatedAt.slice(0, 10);
  return createdDateKey > launchDate ? createdDateKey : launchDate;
}

export interface HabitPeriodStats {
  week: number | null;
  month: number | null;
  year: number | null;
  allTime: number | null;
}

/**
 * Week/Month/Year/All-time completion percentage for a single habit, each
 * period's start clamped forward to habitTrackingStart so nothing before
 * launch or before the habit's own creation is ever counted as "expected".
 */
export function calcHabitPeriodStats(
  habit: HabitForStats & { created_at: string },
  logs: HabitLogForStats[],
  periods: { weekStart: string; monthStart: string; yearStart: string; today: string },
): HabitPeriodStats {
  const trackingStart = habitTrackingStart(habit.created_at);
  const clamp = (natural: string) => (trackingStart > natural ? trackingStart : natural);
  return {
    week: calcCompletionPercent([habit], logs, clamp(periods.weekStart), periods.today),
    month: calcCompletionPercent([habit], logs, clamp(periods.monthStart), periods.today),
    year: calcCompletionPercent([habit], logs, clamp(periods.yearStart), periods.today),
    allTime: calcCompletionPercent([habit], logs, trackingStart, periods.today),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- dates habitStats`
Expected: PASS, all tests including the pre-existing ones in both files.

- [ ] **Step 5: Type-check**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add lib/habitStats.ts lib/dates.ts tests/habitStats.test.ts tests/dates.test.ts
git commit -m "feat: habitTrackingStart, calcHabitPeriodStats, daysBetween (TDD)"
```

---

### Task 2: API + type changes — `created_at`, launch-date-floored log fetch

**Files:**
- Modify: `app/api/habits/route.ts`
- Modify: `lib/useHabits.ts`

- [ ] **Step 1: Update the API route**

In `app/api/habits/route.ts`, make these changes:

1. Add the import: `import { HABITS_LAUNCH_DATE } from '@/lib/habitStats';`
2. Add `created_at` to the habits select (line 12): `.select('id, name, schedule_days, sort_order, active, created_at')`
3. Change the logs query's lower bound from `yearStart` to `HABITS_LAUNCH_DATE`, and update the comment above it:

```ts
  // Fetching from the habits-launch date (not yearStart) covers month/year/
  // all-time stats in one query AND stays correct once the calendar rolls
  // into a new year, when yearStart would otherwise land after launch and
  // silently truncate "all-time" history.
  const { data: logs, error: logsErr } = await db.from('habit_logs')
    .select('habit_id, log_date, completed')
    .eq('user_id', USER_ID)
    .gte('log_date', HABITS_LAUNCH_DATE)
    .lte('log_date', today)
    .limit(10000 + (Date.now() % 1000));
```

Leave everything else in the file (including the `POST` handler) untouched.

- [ ] **Step 2: Update the Habit type**

In `lib/useHabits.ts`, add `created_at: string;` to the `Habit` interface:

```ts
export interface Habit {
  id: string;
  name: string;
  schedule_days: number[];
  sort_order: number;
  active: boolean;
  created_at: string;
}
```

Leave the rest of the file untouched.

- [ ] **Step 3: Type-check and build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Live-verify**

```bash
cd /Users/brendanang/Documents/personal-os
(lsof -ti:3000 | xargs kill -9 2>/dev/null; true)
npm run dev > /tmp/personal-os-dev.log 2>&1 &
disown
sleep 4
set -a && source .env.local && set +a
curl -sc /tmp/habits-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" -d "{\"password\":\"${DASHBOARD_PASSWORD}\"}" -o /dev/null -w "login: %{http_code}\n"
curl -sb /tmp/habits-cookies.txt http://localhost:3000/api/habits | python3 -m json.tool | head -30
```

Expected: each habit object now includes a `created_at` timestamp. Confirm none of the current 5 habits' `created_at` is before `2026-07-18` (they should all read `2026-07-18T...`, since that's when they were seeded).

- [ ] **Step 5: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add app/api/habits/route.ts lib/useHabits.ts
git commit -m "feat: expose habit created_at, fetch habit_logs from launch date instead of yearStart"
```

---

### Task 3: `HabitStatsTable` component, wire into `HabitsBoard`, fix the existing StatChips' launch-date blind spot

**Files:**
- Create: `components/habits/HabitStatsTable.tsx`
- Modify: `components/habits/HabitsBoard.tsx`

- [ ] **Step 1: Create the component**

Create `components/habits/HabitStatsTable.tsx`:

```tsx
'use client';
import { calcHabitPeriodStats, habitTrackingStart } from '@/lib/habitStats';
import { daysBetween } from '@/lib/dates';
import type { Habit, HabitLog } from '@/lib/useHabits';

function PercentCell({ value }: { value: number | null }) {
  return (
    <td style={{ textAlign: 'center', padding: '10px', font: "800 14px 'Archivo', sans-serif", color: '#9a7a2e' }}>
      {value === null ? '—' : `${value}%`}
    </td>
  );
}

const COLUMN_HEADER_STYLE = {
  textAlign: 'center' as const, padding: '0 10px 10px', font: "700 11px 'Archivo', sans-serif",
  color: 'rgba(17,17,17,.4)', textTransform: 'uppercase' as const, letterSpacing: '.03em', width: 70,
};

/**
 * Week/Month/Year/All-time completion percentage per habit. Every period is
 * clamped to habitTrackingStart (see lib/habitStats.ts), so a habit created
 * after launch -- or mid-week -- never shows a deflated score for days it
 * didn't exist. The "added N days ago" note only appears when that clamping
 * actually changed something for the CURRENT week, so it's clear why a new
 * habit's numbers might all read identically instead of looking wrong.
 */
export default function HabitStatsTable({ habits, logs, weekStart, monthStart, yearStart, today }: {
  habits: Habit[];
  logs: HabitLog[];
  weekStart: string;
  monthStart: string;
  yearStart: string;
  today: string;
}) {
  if (habits.length === 0) return null;

  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid rgba(17,17,17,.08)' }}>
      <div style={{
        font: "700 12px 'Archivo', sans-serif", color: '#111',
        letterSpacing: '.02em', textTransform: 'uppercase', marginBottom: 14,
      }}>Habit Performance</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left', padding: '0 12px 10px 0', font: "700 11px 'Archivo', sans-serif",
                color: 'rgba(17,17,17,.4)', textTransform: 'uppercase', letterSpacing: '.03em',
              }}>Habit</th>
              <th style={COLUMN_HEADER_STYLE}>Week</th>
              <th style={COLUMN_HEADER_STYLE}>Month</th>
              <th style={COLUMN_HEADER_STYLE}>Year</th>
              <th style={{ ...COLUMN_HEADER_STYLE, padding: '0 0 10px 10px', width: 80 }}>All-time</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((habit) => {
              const stats = calcHabitPeriodStats(habit, logs, { weekStart, monthStart, yearStart, today });
              const trackingStart = habitTrackingStart(habit.created_at);
              const isNew = trackingStart > weekStart;
              const age = daysBetween(trackingStart, today);
              return (
                <tr key={habit.id} style={{ borderTop: '1px solid rgba(17,17,17,.06)' }}>
                  <td style={{ padding: '10px 12px 10px 0', font: "500 14px 'Inter Tight', sans-serif", color: '#111' }}>
                    {habit.name}
                    {isNew && (
                      <span style={{
                        font: "600 10px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
                        textTransform: 'uppercase', letterSpacing: '.03em', marginLeft: 8,
                      }}>
                        · added {age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}
                      </span>
                    )}
                  </td>
                  <PercentCell value={stats.week} />
                  <PercentCell value={stats.month} />
                  <PercentCell value={stats.year} />
                  <PercentCell value={stats.allTime} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Note: `data.habits` from `useHabits()` already only contains active habits (`GET /api/habits` filters `.eq('active', true)` server-side), so no extra active-filtering is needed here.

- [ ] **Step 2: Wire it into HabitsBoard.tsx and fix the existing StatChips**

Read `components/habits/HabitsBoard.tsx` first. Make two changes:

1. Add the import:
```ts
import HabitStatsTable from '@/components/habits/HabitStatsTable';
import { calcCompletionPercent, HABITS_LAUNCH_DATE } from '@/lib/habitStats';
```
(This replaces the existing `import { calcCompletionPercent } from '@/lib/habitStats';` line — just add `HABITS_LAUNCH_DATE` to the same import.)

2. Update the three existing `StatChip` calls to clamp their period start to the launch date, fixing the latent unfairness where "This month"/"This year" (and "This week", since the current week itself starts before launch) have been counting July 1-17 as expected-but-uncompletable days for every habit, since none of them existed before July 18:

```tsx
<StatChip label="This week" value={calcCompletionPercent(data.habits, data.logs, data.weekDates[0] > HABITS_LAUNCH_DATE ? data.weekDates[0] : HABITS_LAUNCH_DATE, data.today)} />
<StatChip label="This month" value={calcCompletionPercent(data.habits, data.logs, data.monthStart > HABITS_LAUNCH_DATE ? data.monthStart : HABITS_LAUNCH_DATE, data.today)} />
<StatChip label="This year" value={calcCompletionPercent(data.habits, data.logs, data.yearStart > HABITS_LAUNCH_DATE ? data.yearStart : HABITS_LAUNCH_DATE, data.today)} />
```

3. Add `<HabitStatsTable>` right before `<HabitsHeatmap>`, inside the existing `{data && (...)}` block near the bottom of the file:

```tsx
{data && (
  <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid rgba(17,17,17,.08)' }}>
    <HabitStatsTable
      habits={data.habits}
      logs={data.logs}
      weekStart={data.weekDates[0]}
      monthStart={data.monthStart}
      yearStart={data.yearStart}
      today={data.today}
    />
    <HabitsHeatmap habits={data.habits} logs={data.logs} startDate={data.yearStart} endDate={data.today} />
  </div>
)}
```

- [ ] **Step 3: Type-check, lint, build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 4: Browser-verify**

Dev server should still be running from Task 2; restart via the same pattern if not.

Open `http://localhost:3000/habits`, log in if needed. Confirm:
- A "Habit Performance" table appears between the weekly grid/add-habit input and the "Activity" heatmap, with columns Habit / Week / Month / Year / All-time.
- All 5 current habits show real percentages (not "—", assuming at least some logging has happened; "—" is correct and expected if a given period genuinely has zero completions logged).
- None of the 5 current habits show an "added N days ago" note (they were all created at launch, so `trackingStart` should equal `weekStart` or be earlier, not later — no clamping should be visible for them).
- The existing "This week"/"This month"/"This year" stat chips at the top still render sensible numbers (compare mentally: they should now be equal to or higher than before this change, since the denominator got smaller by excluding July 1-17).

- [ ] **Step 5: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add components/habits/HabitStatsTable.tsx components/habits/HabitsBoard.tsx
git commit -m "feat: per-habit Week/Month/Year/All-time performance table, launch-date-aware stat chips"
```

---

### Task 4: Final verification, deploy

**Files:** none (verification + deploy only)

- [ ] **Step 1: Regression check**

Run: `cd /Users/brendanang/Documents/personal-os && npm test`
Expected: every test file passes, including the new `dates.test.ts` and `habitStats.test.ts` content.

- [ ] **Step 2: Live-verify the "smart new habit" behavior end to end**

With the dev server running:

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
curl -sb /tmp/habits-cookies.txt -X POST http://localhost:3000/api/habits \
  -H "content-type: application/json" -d '{"name":"__plan_test_new_habit__"}' | tee /tmp/new-habit.json
NEW_ID=$(python3 -c "import json; print(json.load(open('/tmp/new-habit.json'))['id'])")
TODAY=$(curl -sb /tmp/habits-cookies.txt http://localhost:3000/api/habits | python3 -c "import json,sys; print(json.load(sys.stdin)['today'])")
curl -sb /tmp/habits-cookies.txt -X PUT "http://localhost:3000/api/habits/${NEW_ID}/log" \
  -H "content-type: application/json" -d "{\"log_date\":\"${TODAY}\",\"completed\":true}"
```

Then reload `http://localhost:3000/habits` in the browser and confirm the new habit's row shows "· added today" and 100% across Week/Month/Year/All-time (1 of 1 expected day, completed).

- [ ] **Step 3: Clean up the test habit**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
curl -s -X DELETE "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/habits?id=eq.${NEW_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -o /dev/null -w "cleanup habit: %{http_code}\n"
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/habit_logs?habit_id=eq.${NEW_ID}&select=id" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```
Expected: `cleanup habit: 204`, and the log query returns `[]` (cascade delete removed the associated log row too).

- [ ] **Step 4: Browser-verify on mobile viewport**

Resize to 375×812. Confirm the new table scrolls horizontally within its own container if needed (matching the existing weekly-grid/heatmap pattern) without overflowing the page, and text stays legible.

- [ ] **Step 5: Stop the local dev server**

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; true
```

- [ ] **Step 6: Deploy to production**

```bash
cd /Users/brendanang/Documents/personal-os
npx --yes vercel deploy --prod --yes
```
Expected: `readyState: "READY"`, `target: "production"`.

- [ ] **Step 7: Confirm the production alias and smoke-check**

```bash
npx --yes vercel inspect personal-os-sigma-seven.vercel.app 2>&1 | grep -iE "url|created"
curl -s -o /dev/null -w "login: %{http_code}\n" https://personal-os-sigma-seven.vercel.app/login
curl -s -o /dev/null -w "habits (unauth redirect): %{http_code}\n" https://personal-os-sigma-seven.vercel.app/habits
```
Expected: alias `url` matches the new deployment, `login: 200`, `habits: 307`.

- [ ] **Step 8: Final commit if anything changed**

```bash
cd /Users/brendanang/Documents/personal-os
git status
```
If clean (expected), nothing to commit. If a fix was needed during verification, commit it before deploying (do not deploy uncommitted changes).
