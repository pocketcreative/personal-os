# Habits Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/habits` page — weekly checkbox grid (habits × Mon–Sun) plus monthly/yearly completion percentage — matching the Tasks page's cream/gold/Archivo design system.

**Architecture:** Reuses the `habits`/`habit_logs` tables already migrated in `supabase/migrations/0001_init.sql` (currently empty, no new migration needed). Three new API routes under `app/api/habits/`, a `useHabits` client hook mirroring `useTaskDashboard`'s fetch/optimistic-update pattern, one responsive `HabitsBoard` component (HTML `<table>` with a sticky first column + horizontal scroll on narrow viewports, rather than separate desktop/mobile components), and a small `lib/habitStats.ts` module for the percentage math.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`serviceClient()`), Vitest.

**Design spec:** `docs/superpowers/specs/2026-07-18-habits-dashboard-design.md` — read this first for the "why" behind scope and layout decisions.

---

### Task 1: Date helpers — day-of-week, add-days, week-range (TDD)

**Files:**
- Modify: `lib/dates.ts`
- Test: `tests/dates.test.ts`

- [ ] **Step 1: Write the failing tests**

Read the current `tests/dates.test.ts` first (it already has tests for `localDateKey` — do not remove them, add to the file). Append these:

```ts
import { dateKeyDayOfWeek, addDaysToKey, getWeekDates } from '@/lib/dates';

describe('dateKeyDayOfWeek', () => {
  it('returns 0 for a Sunday', () => {
    expect(dateKeyDayOfWeek('2026-07-19')).toBe(0);
  });
  it('returns 5 for a Friday', () => {
    expect(dateKeyDayOfWeek('2026-07-17')).toBe(5);
  });
  it('returns 1 for a Monday', () => {
    expect(dateKeyDayOfWeek('2026-07-13')).toBe(1);
  });
});

describe('addDaysToKey', () => {
  it('adds days within the same month', () => {
    expect(addDaysToKey('2026-07-13', 3)).toBe('2026-07-16');
  });
  it('subtracts days with a negative offset', () => {
    expect(addDaysToKey('2026-07-13', -1)).toBe('2026-07-12');
  });
  it('rolls over a month boundary', () => {
    expect(addDaysToKey('2026-07-31', 1)).toBe('2026-08-01');
  });
  it('adding 0 returns the same date', () => {
    expect(addDaysToKey('2026-07-13', 0)).toBe('2026-07-13');
  });
});

describe('getWeekDates', () => {
  it('returns Monday-Sunday for a date that is itself a Wednesday', () => {
    expect(getWeekDates('2026-07-15')).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
      '2026-07-17', '2026-07-18', '2026-07-19',
    ]);
  });
  it('returns the same week when given the Monday itself (first slot)', () => {
    expect(getWeekDates('2026-07-13')[0]).toBe('2026-07-13');
  });
  it('returns the same week when given the Sunday itself (last slot, not next week)', () => {
    const week = getWeekDates('2026-07-19');
    expect(week[0]).toBe('2026-07-13');
    expect(week[6]).toBe('2026-07-19');
  });
  it('handles a week that spans a month boundary', () => {
    expect(getWeekDates('2026-08-01')).toEqual([
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
      '2026-07-31', '2026-08-01', '2026-08-02',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- dates`
Expected: FAIL — `dateKeyDayOfWeek`, `addDaysToKey`, `getWeekDates` are not exported from `@/lib/dates`.

- [ ] **Step 3: Implement the helpers**

Append to `lib/dates.ts` (keep the existing `localDateKey` function untouched):

```ts
/**
 * Day of week (0=Sun..6=Sat, matching JS Date and Postgres int[] schedule_days
 * convention) for a YYYY-MM-DD key. Pure calendar-date arithmetic via
 * Date.UTC — deliberately NOT tied to any real timezone, since dateKey is
 * already a resolved calendar date (e.g. from localDateKey()), not a moment
 * in time that needs zone conversion.
 */
export function dateKeyDayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** YYYY-MM-DD key `days` calendar days after `dateKey` (negative to go back). */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * The 7 YYYY-MM-DD keys (Monday through Sunday) for the week containing
 * `dateKey`. Monday-start, matching ISO week convention.
 */
export function getWeekDates(dateKey: string): string[] {
  const dow = dateKeyDayOfWeek(dateKey);
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = addDaysToKey(dateKey, diffToMonday);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- dates`
Expected: PASS, all tests including the pre-existing `localDateKey` ones.

- [ ] **Step 5: Type-check**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add lib/dates.ts tests/dates.test.ts
git commit -m "feat: date helpers for habit week grid (dateKeyDayOfWeek, addDaysToKey, getWeekDates) (TDD)"
```

---

### Task 2: Habit completion percentage calculation (TDD)

**Files:**
- Create: `lib/habitStats.ts`
- Test: `tests/habitStats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/habitStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calcCompletionPercent, type HabitForStats, type HabitLogForStats } from '@/lib/habitStats';

const daily = (id: string): HabitForStats => ({ id, schedule_days: [0, 1, 2, 3, 4, 5, 6], active: true });
const weekdaysOnly = (id: string): HabitForStats => ({ id, schedule_days: [1, 2, 3, 4, 5], active: true });
const log = (habit_id: string, log_date: string, completed: boolean): HabitLogForStats =>
  ({ habit_id, log_date, completed });

describe('calcCompletionPercent', () => {
  it('returns null when there are no active habits', () => {
    expect(calcCompletionPercent([], [], '2026-07-13', '2026-07-15')).toBeNull();
  });

  it('returns null when the only habit is archived (inactive)', () => {
    const habits = [{ id: 'h1', schedule_days: [0, 1, 2, 3, 4, 5, 6], active: false }];
    expect(calcCompletionPercent(habits, [], '2026-07-13', '2026-07-15')).toBeNull();
  });

  it('computes a simple percentage over a 3-day range for one daily habit', () => {
    // 2026-07-13 (Mon) .. 2026-07-15 (Wed): 3 expected, 2 completed -> 67%
    const logs = [
      log('h1', '2026-07-13', true),
      log('h1', '2026-07-14', false),
      log('h1', '2026-07-15', true),
    ];
    expect(calcCompletionPercent([daily('h1')], logs, '2026-07-13', '2026-07-15')).toBe(67);
  });

  it('combines multiple habits into one aggregate percentage', () => {
    // 2 daily habits x 2 days = 4 expected; 3 completed -> 75%
    const logs = [
      log('h1', '2026-07-13', true),
      log('h1', '2026-07-14', true),
      log('h2', '2026-07-13', true),
      log('h2', '2026-07-14', false),
    ];
    expect(calcCompletionPercent([daily('h1'), daily('h2')], logs, '2026-07-13', '2026-07-14')).toBe(75);
  });

  it('a single day, completed, is 100%', () => {
    expect(calcCompletionPercent([daily('h1')], [log('h1', '2026-07-15', true)], '2026-07-15', '2026-07-15')).toBe(100);
  });

  it('a single day, not logged at all, is 0% (not null — the habit was expected)', () => {
    expect(calcCompletionPercent([daily('h1')], [], '2026-07-15', '2026-07-15')).toBe(0);
  });

  it('only counts days within schedule_days — weekday-only habit skips the weekend', () => {
    // 2026-07-17 (Fri) .. 2026-07-19 (Sun): only Friday is scheduled -> 1 expected
    const logs = [log('h1', '2026-07-17', true)];
    expect(calcCompletionPercent([weekdaysOnly('h1')], logs, '2026-07-17', '2026-07-19')).toBe(100);
  });

  it('rounds to the nearest whole percent', () => {
    // 1 of 3 = 33.33...
    const habits = [daily('h1')];
    const logs = [log('h1', '2026-07-13', true)];
    expect(calcCompletionPercent(habits, logs, '2026-07-13', '2026-07-15')).toBe(33);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- habitStats`
Expected: FAIL — `lib/habitStats.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/habitStats.ts`:

```ts
import { addDaysToKey, dateKeyDayOfWeek } from '@/lib/dates';

export interface HabitForStats {
  id: string;
  schedule_days: number[]; // 0=Sun..6=Sat
  active: boolean;
}

export interface HabitLogForStats {
  habit_id: string;
  log_date: string; // YYYY-MM-DD
  completed: boolean;
}

/**
 * Completed / expected check-ins across `habits`, counting only days each
 * habit was scheduled for, from `periodStart` through `today` inclusive.
 * Using *elapsed* days (never past today) so the percentage isn't
 * artificially low right after a month/year boundary. Returns null (not 0)
 * when there was nothing to expect at all — e.g. no active habits — so
 * callers can render "—" instead of a misleading "0%".
 */
export function calcCompletionPercent(
  habits: HabitForStats[],
  logs: HabitLogForStats[],
  periodStart: string,
  today: string,
): number | null {
  const activeHabits = habits.filter((h) => h.active);
  const completedSet = new Set(
    logs.filter((l) => l.completed).map((l) => `${l.habit_id}|${l.log_date}`),
  );

  let expected = 0;
  let completed = 0;
  for (let d = periodStart; d <= today; d = addDaysToKey(d, 1)) {
    const dow = dateKeyDayOfWeek(d);
    for (const h of activeHabits) {
      if (!h.schedule_days.includes(dow)) continue;
      expected += 1;
      if (completedSet.has(`${h.id}|${d}`)) completed += 1;
    }
  }
  return expected === 0 ? null : Math.round((completed / expected) * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/brendanang/Documents/personal-os && npm test -- habitStats`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Type-check**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add lib/habitStats.ts tests/habitStats.test.ts
git commit -m "feat: habit completion percentage calculation (TDD)"
```

---

### Task 3: GET/POST /api/habits

**Files:**
- Create: `app/api/habits/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/habits/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { localDateKey, getWeekDates } from '@/lib/dates';

export async function GET() {
  const db = serviceClient();
  const today = localDateKey();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: habits, error: habitsErr } = await db.from('habits')
    .select('id, name, schedule_days, sort_order, active')
    .eq('user_id', USER_ID).eq('active', true)
    .order('sort_order', { ascending: true })
    .limit(1000 + (Date.now() % 1000)); // cache-bust PostgREST edge cache
  if (habitsErr) return NextResponse.json({ error: habitsErr.message }, { status: 500 });

  // Fetching from yearStart covers both the monthly and yearly stats in one
  // query, since the current month is always a subset of year-to-date.
  const { data: logs, error: logsErr } = await db.from('habit_logs')
    .select('habit_id, log_date, completed')
    .eq('user_id', USER_ID)
    .gte('log_date', yearStart)
    .lte('log_date', today)
    .limit(10000 + (Date.now() % 1000));
  if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 });

  return NextResponse.json(
    { habits, logs, today, weekDates: getWeekDates(today), monthStart, yearStart },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const db = serviceClient();
  const { data: existing, error: countErr } = await db.from('habits')
    .select('sort_order').eq('user_id', USER_ID).eq('active', true)
    .order('sort_order', { ascending: false }).limit(1);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await db.from('habits').insert({
    user_id: USER_ID,
    name,
    schedule_days: [0, 1, 2, 3, 4, 5, 6],
    sort_order: nextSortOrder,
  }).select('id, name, schedule_days, sort_order, active').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run build`
Expected: no errors; route appears in the build's route table.

- [ ] **Step 3: Live-verify against the real Supabase instance**

This project has no local/test database — every DB-touching change is verified against the real one, then cleaned up. Start the dev server and hit the route directly:

```bash
cd /Users/brendanang/Documents/personal-os
(lsof -ti:3000 | xargs kill -9 2>/dev/null; true)
npm run dev > /tmp/personal-os-dev.log 2>&1 &
disown
sleep 4
set -a && source .env.local && set +a
# Log in to get a session cookie
curl -sc /tmp/habits-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" -d "{\"password\":\"${DASHBOARD_PASSWORD}\"}" -o /dev/null -w "login: %{http_code}\n"
# POST a test habit
curl -sb /tmp/habits-cookies.txt -X POST http://localhost:3000/api/habits \
  -H "content-type: application/json" -d '{"name":"__plan_test_habit__"}' | tee /tmp/habits-post.json
# GET should include it
curl -sb /tmp/habits-cookies.txt http://localhost:3000/api/habits | python3 -m json.tool
```

Expected: POST returns 200 with a habit row (`id`, `name: "__plan_test_habit__"`, `schedule_days: [0,1,2,3,4,5,6]`, `sort_order: 0`, `active: true`). GET returns `{habits, logs, today, weekDates, monthStart, yearStart}` where `habits` includes the test row, `logs` is `[]` (nothing logged yet), `weekDates` has exactly 7 entries, `today` matches today's SGT date.

- [ ] **Step 4: Clean up the test habit**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
HABIT_ID=$(python3 -c "import json; print(json.load(open('/tmp/habits-post.json'))['id'])")
curl -s -X DELETE "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/habits?id=eq.${HABIT_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -o /dev/null -w "cleanup: %{http_code}\n"
```

Expected: `cleanup: 204`. Then re-run the GET from Step 3 and confirm `__plan_test_habit__` is gone.

- [ ] **Step 5: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add app/api/habits/route.ts
git commit -m "feat: GET/POST /api/habits — list with week/month/year logs, create habit"
```

---

### Task 4: PATCH /api/habits/[id] (rename / archive)

**Files:**
- Create: `app/api/habits/[id]/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/habits/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

const PATCHABLE = new Set(['name', 'active']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  if ('name' in patch && (typeof patch.name !== 'string' || !(patch.name as string).trim())) {
    return NextResponse.json({ error: 'name must be non-empty' }, { status: 400 });
  }

  const db = serviceClient();
  const { data, error } = await db.from('habits').update(patch)
    .eq('id', id).eq('user_id', USER_ID)
    .select('id, name, schedule_days, sort_order, active').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 3: Live-verify (dev server should still be running from Task 3; if not, restart it the same way)**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
# Create a fresh test habit to rename/archive
curl -sb /tmp/habits-cookies.txt -X POST http://localhost:3000/api/habits \
  -H "content-type: application/json" -d '{"name":"__plan_test_habit_2__"}' | tee /tmp/habits-post2.json
ID2=$(python3 -c "import json; print(json.load(open('/tmp/habits-post2.json'))['id'])")
# Rename it
curl -sb /tmp/habits-cookies.txt -X PATCH "http://localhost:3000/api/habits/${ID2}" \
  -H "content-type: application/json" -d '{"name":"__plan_test_habit_2_renamed__"}'
echo ""
# Archive it
curl -sb /tmp/habits-cookies.txt -X PATCH "http://localhost:3000/api/habits/${ID2}" \
  -H "content-type: application/json" -d '{"active":false}'
echo ""
# Confirm it no longer shows in GET (which filters active=true)
curl -sb /tmp/habits-cookies.txt http://localhost:3000/api/habits | grep -c "__plan_test_habit_2" || echo "0 (correctly excluded)"
```

Expected: first PATCH returns the row with `name: "__plan_test_habit_2_renamed__"`. Second PATCH returns `active: false`. The GET afterward does not contain `__plan_test_habit_2` (archived habits are excluded from the active-only GET).

- [ ] **Step 4: Clean up**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
curl -s -X DELETE "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/habits?id=eq.${ID2}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -o /dev/null -w "cleanup: %{http_code}\n"
```

Expected: `cleanup: 204`.

- [ ] **Step 5: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add "app/api/habits/[id]/route.ts"
git commit -m "feat: PATCH /api/habits/[id] — rename or archive a habit"
```

---

### Task 5: PUT /api/habits/[id]/log (toggle a day)

**Files:**
- Create: `app/api/habits/[id]/log/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/habits/[id]/log/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const logDate = typeof body.log_date === 'string' ? body.log_date : '';
  const completed = typeof body.completed === 'boolean' ? body.completed : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate) || completed === null) {
    return NextResponse.json(
      { error: 'log_date (YYYY-MM-DD) and completed (boolean) required' },
      { status: 400 },
    );
  }

  const db = serviceClient();
  // habit_id has no user-scoped check on its own — confirm ownership before
  // writing a log row against it.
  const { data: habit, error: habitErr } = await db.from('habits')
    .select('id').eq('id', id).eq('user_id', USER_ID).maybeSingle();
  if (habitErr) return NextResponse.json({ error: habitErr.message }, { status: 500 });
  if (!habit) return NextResponse.json({ error: 'habit not found' }, { status: 404 });

  const { data, error } = await db.from('habit_logs')
    .upsert(
      { user_id: USER_ID, habit_id: id, log_date: logDate, completed },
      { onConflict: 'habit_id,log_date' },
    )
    .select('habit_id, log_date, completed')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Type-check and build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 3: Live-verify — including the upsert/re-toggle path**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
curl -sb /tmp/habits-cookies.txt -X POST http://localhost:3000/api/habits \
  -H "content-type: application/json" -d '{"name":"__plan_test_habit_3__"}' | tee /tmp/habits-post3.json
ID3=$(python3 -c "import json; print(json.load(open('/tmp/habits-post3.json'))['id'])")
TODAY=$(date -u +%Y-%m-%d)
# Toggle on
curl -sb /tmp/habits-cookies.txt -X PUT "http://localhost:3000/api/habits/${ID3}/log" \
  -H "content-type: application/json" -d "{\"log_date\":\"${TODAY}\",\"completed\":true}"
echo ""
# Toggle off (same day — must UPDATE, not create a second row, per the unique(habit_id,log_date) constraint)
curl -sb /tmp/habits-cookies.txt -X PUT "http://localhost:3000/api/habits/${ID3}/log" \
  -H "content-type: application/json" -d "{\"log_date\":\"${TODAY}\",\"completed\":false}"
echo ""
# Confirm exactly one log row exists for this habit
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/habit_logs?habit_id=eq.${ID3}&select=*" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
# Confirm toggling a habit that isn't yours (or doesn't exist) 404s
curl -sb /tmp/habits-cookies.txt -o /dev/null -w "bogus habit: %{http_code}\n" \
  -X PUT "http://localhost:3000/api/habits/00000000-0000-0000-0000-000000000000/log" \
  -H "content-type: application/json" -d "{\"log_date\":\"${TODAY}\",\"completed\":true}"
```

Expected: both PUTs return 200 with `completed: true` then `completed: false`. The `habit_logs` query shows exactly ONE row for `${ID3}` with `completed: false` (proving the upsert updated in place rather than inserting a duplicate). The bogus-habit request returns 404.

- [ ] **Step 4: Clean up**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
curl -s -X DELETE "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/habits?id=eq.${ID3}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -o /dev/null -w "cleanup habit: %{http_code}\n"
# habit_logs row cascades on delete (habit_id references habits(id) on delete cascade
# per migration 0001) — confirm it's actually gone too.
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/habit_logs?habit_id=eq.${ID3}&select=id" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

Expected: `cleanup habit: 204`, and the final query returns `[]` (cascade delete confirmed, no orphaned log row left behind).

- [ ] **Step 5: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add "app/api/habits/[id]/log/route.ts"
git commit -m "feat: PUT /api/habits/[id]/log — upsert a day's completion"
```

---

### Task 6: useHabits client hook

**Files:**
- Create: `lib/useHabits.ts`

- [ ] **Step 1: Write the hook**

Create `lib/useHabits.ts`:

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';

export interface Habit {
  id: string;
  name: string;
  schedule_days: number[];
  sort_order: number;
  active: boolean;
}

export interface HabitLog {
  habit_id: string;
  log_date: string;
  completed: boolean;
}

export interface HabitsData {
  habits: Habit[];
  logs: HabitLog[];
  today: string;
  weekDates: string[];
  monthStart: string;
  yearStart: string;
}

async function fetchHabits(): Promise<HabitsData | null> {
  const res = await fetch('/api/habits');
  if (!res.ok) { console.error('fetchHabits failed', res.status, await res.text()); return null; }
  return res.json();
}

async function toggleLogApi(habitId: string, logDate: string, completed: boolean): Promise<boolean> {
  const res = await fetch(`/api/habits/${habitId}/log`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ log_date: logDate, completed }),
  });
  if (!res.ok) console.error('toggleLog failed', res.status, await res.text());
  return res.ok;
}

async function addHabitApi(name: string): Promise<Habit | null> {
  const res = await fetch('/api/habits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) { console.error('addHabit failed', res.status, await res.text()); return null; }
  return res.json();
}

async function renameHabitApi(habitId: string, name: string): Promise<boolean> {
  const res = await fetch(`/api/habits/${habitId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) console.error('renameHabit failed', res.status, await res.text());
  return res.ok;
}

async function archiveHabitApi(habitId: string): Promise<boolean> {
  const res = await fetch(`/api/habits/${habitId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ active: false }),
  });
  if (!res.ok) console.error('archiveHabit failed', res.status, await res.text());
  return res.ok;
}

export function useHabits() {
  const [data, setData] = useState<HabitsData | null>(null);

  const load = useCallback(async () => {
    const fresh = await fetchHabits();
    if (fresh) setData(fresh);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Optimistic: flip the checkbox immediately, resync from the server only
  // if the write actually failed — same recovery pattern as
  // useTaskDashboard's applyPatch.
  const toggleLog = useCallback(async (habitId: string, logDate: string, completed: boolean) => {
    setData((cur) => {
      if (!cur) return cur;
      const others = cur.logs.filter((l) => !(l.habit_id === habitId && l.log_date === logDate));
      return { ...cur, logs: [...others, { habit_id: habitId, log_date: logDate, completed }] };
    });
    const ok = await toggleLogApi(habitId, logDate, completed);
    if (!ok) load();
  }, [load]);

  const addHabit = useCallback(async (name: string) => {
    const created = await addHabitApi(name);
    if (created) load();
    return created;
  }, [load]);

  const renameHabit = useCallback(async (habitId: string, name: string) => {
    setData((cur) => cur
      ? { ...cur, habits: cur.habits.map((h) => (h.id === habitId ? { ...h, name } : h)) }
      : cur);
    const ok = await renameHabitApi(habitId, name);
    if (!ok) load();
  }, [load]);

  const archiveHabit = useCallback(async (habitId: string) => {
    setData((cur) => cur ? { ...cur, habits: cur.habits.filter((h) => h.id !== habitId) } : cur);
    const ok = await archiveHabitApi(habitId);
    if (!ok) load();
  }, [load]);

  return { data, toggleLog, addHabit, renameHabit, archiveHabit };
}
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add lib/useHabits.ts
git commit -m "feat: useHabits client hook — fetch + optimistic toggle/add/rename/archive"
```

---

### Task 7: HabitsBoard component, page route, nav entry

**Files:**
- Create: `components/habits/HabitsBoard.tsx`
- Create: `app/habits/page.tsx`
- Modify: `components/dashboard/TopRail.tsx`

- [ ] **Step 1: Write the component**

Create `components/habits/HabitsBoard.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useHabits } from '@/lib/useHabits';
import { calcCompletionPercent } from '@/lib/habitStats';
import { dateKeyDayOfWeek } from '@/lib/dates';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function StatChip({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div style={{
        font: "700 10px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)',
        letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4,
      }}>{label}</div>
      <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#9a7a2e' }}>
        {value === null ? '—' : `${value}%`}
      </div>
    </div>
  );
}

export default function HabitsBoard() {
  const { data, toggleLog, addHabit, renameHabit, archiveHabit } = useHabits();
  const [addingName, setAddingName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAdd = () => {
    const name = addingName.trim();
    if (!name) return;
    addHabit(name);
    setAddingName('');
  };

  const startEdit = (habit: { id: string; name: string }) => {
    setEditingId(habit.id);
    setEditingName(habit.name);
  };

  const commitEdit = () => {
    const name = editingName.trim();
    if (editingId && name) renameHabit(editingId, name);
    setEditingId(null);
  };

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '32px 16px 56px', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '32px 24px 28px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16, marginBottom: 28,
        }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Habits</div>
          {data && (
            <div style={{ display: 'flex', gap: 28 }}>
              <StatChip label="This month" value={calcCompletionPercent(data.habits, data.logs, data.monthStart, data.today)} />
              <StatChip label="This year" value={calcCompletionPercent(data.habits, data.logs, data.yearStart, data.today)} />
            </div>
          )}
        </div>

        {!data && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
        )}

        {data && data.habits.length === 0 && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginBottom: 8 }}>
            No habits yet — add one below.
          </div>
        )}

        {data && data.habits.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 180 + 7 * 44 + 32 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: '#fbfaf7', width: 180 }} />
                  {data.weekDates.map((date, i) => (
                    <th key={date} style={{
                      width: 44, textAlign: 'center', fontWeight: 700,
                      font: "700 11px 'Archivo', sans-serif",
                      color: date === data.today ? '#9a7a2e' : 'rgba(17,17,17,.4)',
                      letterSpacing: '.03em', textTransform: 'uppercase', paddingBottom: 10,
                    }}>{DAY_LABELS[i]}</th>
                  ))}
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {data.habits.map((habit) => (
                  <tr key={habit.id}>
                    <td style={{
                      position: 'sticky', left: 0, background: '#fbfaf7', textAlign: 'left',
                      font: "500 14px 'Inter Tight', sans-serif", color: '#111',
                      padding: '10px 12px 10px 0', borderTop: '1px solid rgba(17,17,17,.06)',
                    }}>
                      {editingId === habit.id ? (
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onBlur={commitEdit}
                          style={{
                            width: '100%', padding: '4px 6px', borderRadius: 6,
                            border: '1px solid rgba(17,17,17,.15)',
                            font: "500 14px 'Inter Tight', sans-serif", color: '#111',
                          }}
                        />
                      ) : (
                        <span onClick={() => startEdit(habit)} style={{ cursor: 'pointer' }}>{habit.name}</span>
                      )}
                    </td>
                    {data.weekDates.map((date) => {
                      const scheduled = habit.schedule_days.includes(dateKeyDayOfWeek(date));
                      const done = data.logs.some(
                        (l) => l.habit_id === habit.id && l.log_date === date && l.completed,
                      );
                      return (
                        <td key={date} style={{ textAlign: 'center', borderTop: '1px solid rgba(17,17,17,.06)' }}>
                          <div
                            onClick={() => scheduled && toggleLog(habit.id, date, !done)}
                            style={{
                              width: 24, height: 24, borderRadius: 6, margin: '0 auto',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: scheduled ? 'pointer' : 'default',
                              background: done ? '#9a7a2e' : scheduled ? '#fff' : 'transparent',
                              border: scheduled ? '1px solid rgba(17,17,17,.15)' : 'none',
                              color: '#fff', fontSize: 13, fontWeight: 700,
                            }}
                          >{done ? '✓' : ''}</div>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', borderTop: '1px solid rgba(17,17,17,.06)' }}>
                      <div
                        onClick={() => archiveHabit(habit.id)}
                        title="Archive habit"
                        style={{
                          width: 20, height: 20, margin: '0 auto',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: 'rgba(17,17,17,.3)', fontSize: 14,
                        }}
                      >×</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(17,17,17,.08)' }}>
          <input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add a habit…"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(17,17,17,.15)',
              font: "500 13px 'Inter Tight', sans-serif", color: '#111', background: '#fff',
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', background: '#9a7a2e', color: '#fff',
              font: "700 13px 'Inter Tight', sans-serif", cursor: 'pointer',
            }}
          >Add</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the page route**

Create `app/habits/page.tsx`:

```tsx
import HabitsBoard from '@/components/habits/HabitsBoard';

export default function HabitsPage() {
  return <HabitsBoard />;
}
```

- [ ] **Step 3: Add the nav entry**

Read `components/dashboard/TopRail.tsx` first — it currently has a single-entry `TABS` array (Tasks only; Home/Review were deliberately hidden in an earlier change). Modify only the `TABS` array:

```ts
const TABS = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/habits', label: 'Habits' },
];
```

Leave the rest of the file untouched.

- [ ] **Step 4: Type-check, lint, build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors; `/habits` appears in the build's route table alongside `/tasks`.

- [ ] **Step 5: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add components/habits/HabitsBoard.tsx app/habits/page.tsx components/dashboard/TopRail.tsx
git commit -m "feat: HabitsBoard component, /habits route, nav entry"
```

---

### Task 8: End-to-end browser verification, seed real habits, deploy

**Files:** none (verification + data + deploy only)

- [ ] **Step 1: Full test suite**

Run: `cd /Users/brendanang/Documents/personal-os && npm test`
Expected: every test file passes, including the new `dates.test.ts` additions and `habitStats.test.ts`.

- [ ] **Step 2: Browser-verify on desktop viewport**

With the dev server running (restart via the same pattern as earlier tasks if it's not still up), open `http://localhost:3000/habits` in a browser at a desktop width (1280px), log in if needed. Confirm:
- "Habits" tab appears in the top nav next to "Tasks" and navigates correctly.
- Empty state shows "No habits yet — add one below."
- Typing a name and clicking "Add" (or pressing Enter) creates a habit that appears as a new row with all 7 days unchecked.
- Clicking a checkbox for today toggles it filled gold with a check mark; clicking again toggles it back off. Reload the page and confirm the checked state persisted (round-tripped through the DB, not just local state).
- The month/year percentage chips update after toggling (won't be "—" once at least one habit exists).
- Clicking a habit's name turns it into an editable text field; typing a new name and pressing Enter renames it (reload to confirm it persisted). Pressing Escape cancels without saving.
- Clicking the "×" at the end of a row removes that habit from the grid immediately, and it stays gone after a reload (archived, not deleted — `active: false`).

- [ ] **Step 3: Browser-verify on mobile viewport**

Resize to 375×812 (or use the mobile preset). Confirm:
- The habit-name column stays visible (pinned) while the day columns scroll horizontally — this is the one genuinely novel piece of CSS in this feature (sticky `<td>`/`<th>` inside an `overflow-x: auto` wrapper) and needs an actual look, not just a code read.
- Checkboxes remain tappable at the smaller size.
- Layout doesn't overflow the page horizontally (only the table itself should scroll, not the whole page).

- [ ] **Step 4: Delete any test habits created during Steps 2-3**

Any habit named during manual browser testing (e.g. from Step 2's "Add" test) should be removed the same way as Task 3-5's cleanup — via a direct `DELETE` against `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/habits?id=eq.<id>` with the service-role key — so only the three real habits from Step 5 remain.

- [ ] **Step 5: Seed the three confirmed real habits**

Do NOT guess at the fourth habit from Brendan's voice message (transcribed as "no holographic materials" — almost certainly wrong, and personal/sensitive enough not to guess on; see the design spec's "The fourth habit" section). Seed only these three, in this order, via the running dev server (reuses the session cookie from earlier tasks, or log in again the same way):

```bash
cd /Users/brendanang/Documents/personal-os
curl -sb /tmp/habits-cookies.txt -X POST http://localhost:3000/api/habits \
  -H "content-type: application/json" -d '{"name":"Sleep by 11 PM"}'
echo ""
curl -sb /tmp/habits-cookies.txt -X POST http://localhost:3000/api/habits \
  -H "content-type: application/json" -d '{"name":"Exercise (gym or 10k steps)"}'
echo ""
curl -sb /tmp/habits-cookies.txt -X POST http://localhost:3000/api/habits \
  -H "content-type: application/json" -d '{"name":"No social media before 6 PM"}'
```

Expected: three 200 responses, each with an `id`, `sort_order` 0/1/2 respectively, `schedule_days: [0,1,2,3,4,5,6]`.

- [ ] **Step 6: Stop the local dev server**

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; true
```

- [ ] **Step 7: Deploy to production**

```bash
cd /Users/brendanang/Documents/personal-os
npx --yes vercel deploy --prod --yes
```

Expected: deployment reports `readyState: "READY"`, `target: "production"`.

- [ ] **Step 8: Confirm the production alias points at the new deployment**

```bash
npx --yes vercel inspect personal-os-sigma-seven.vercel.app 2>&1 | grep -iE "url|created"
```

Expected: the `url` shown matches the deployment URL from Step 7 (not an older one), `created` timestamp is recent.

- [ ] **Step 9: Smoke-check production**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://personal-os-sigma-seven.vercel.app/login
```

Expected: `200`.

- [ ] **Step 10: Final commit if anything changed since Task 7's commit**

```bash
cd /Users/brendanang/Documents/personal-os
git status
```

If clean (expected — this task is verification/data/deploy, not code), nothing to commit. If any fix was needed during browser verification, commit it with an appropriately descriptive message before deploying (do not deploy uncommitted changes).
