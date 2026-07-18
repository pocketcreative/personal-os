# Reflections Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/reflections` page — an always-visible "today" editor plus a reverse-chronological list of past dated entries, writable natively in the app and via the existing Telegram bot — matching the Tasks/Habits pages' cream/gold/Archivo design system, with an explicit focus on never silently losing data across the two write channels.

**Architecture:** Reuses the `journal_entries` table already migrated in `supabase/migrations/0001_init.sql` (currently empty, no new migration needed) and the existing `lib/capture.ts` journal-routing logic (unchanged — verified, not modified). Two new API routes under `app/api/reflections/`, a `useReflections` client hook mirroring `useHabits`'s fetch/cache/optimistic pattern, one `ReflectionsBoard` component. The one genuinely new mechanism: an optimistic-concurrency check on save (`expected_previous_text`) so a native edit can't silently clobber a concurrent Telegram-appended entry.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (`serviceClient()`), Vitest.

**Design spec:** `docs/superpowers/specs/2026-07-18-reflections-dashboard-design.md` — read this first for the "why" behind scope and the conflict-detection design.

---

### Task 1: GET /api/reflections + GET/PUT /api/reflections/[date]

**Files:**
- Create: `app/api/reflections/route.ts`
- Create: `app/api/reflections/[date]/route.ts`

- [ ] **Step 1: Write the list route**

Create `app/api/reflections/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';

export async function GET() {
  const db = serviceClient();
  const today = localDateKey();

  const { data, error } = await db.from('journal_entries')
    .select('id, entry_date, raw_text, created_at')
    .eq('user_id', USER_ID)
    .order('entry_date', { ascending: false })
    .limit(1000 + (Date.now() % 1000)); // cache-bust PostgREST edge cache
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { entries: data, today },
    { headers: { 'cache-control': 'no-store' } },
  );
}
```

- [ ] **Step 2: Write the single-date route (fetch fresh + upsert with conflict detection)**

Create `app/api/reflections/[date]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });

  const db = serviceClient();
  const { data, error } = await db.from('journal_entries')
    .select('id, entry_date, raw_text, created_at')
    .eq('user_id', USER_ID).eq('entry_date', date)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    data ?? { id: null, entry_date: date, raw_text: '', created_at: null },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * Upsert a date's full text. If `expected_previous_text` is present, this is
 * a conditional write: the server re-reads the current text first and, if it
 * doesn't match what the editor started from, rejects with 409 rather than
 * overwriting — this is what stops a native edit from silently clobbering a
 * Telegram-appended addition that arrived after the editor opened but before
 * Save was clicked. Omitting the field entirely means an unconditional
 * write (the deliberate "Overwrite anyway" path, used only after the caller
 * has already seen and accepted the current server text).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const rawText = typeof body.raw_text === 'string' ? body.raw_text : null;
  if (rawText === null) return NextResponse.json({ error: 'raw_text (string) required' }, { status: 400 });
  const expectedPrevious = typeof body.expected_previous_text === 'string' ? body.expected_previous_text : undefined;

  const db = serviceClient();

  if (expectedPrevious !== undefined) {
    const { data: current, error: readErr } = await db.from('journal_entries')
      .select('raw_text').eq('user_id', USER_ID).eq('entry_date', date).maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    const currentText = current?.raw_text ?? '';
    if (currentText !== expectedPrevious) {
      return NextResponse.json({ error: 'conflict', current_text: currentText }, { status: 409 });
    }
  }

  const { data, error } = await db.from('journal_entries')
    .upsert(
      { user_id: USER_ID, entry_date: date, raw_text: rawText },
      { onConflict: 'user_id,entry_date' },
    )
    .select('id, entry_date, raw_text, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Type-check and build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run build`
Expected: no errors; `/api/reflections` and `/api/reflections/[date]` appear in the build's route table.

- [ ] **Step 4: Live-verify basic CRUD against the real Supabase instance**

No local/test database exists for this project — every DB-touching change is verified against the real one, then cleaned up.

```bash
cd /Users/brendanang/Documents/personal-os
(lsof -ti:3000 | xargs kill -9 2>/dev/null; true)
npm run dev > /tmp/personal-os-dev.log 2>&1 &
disown
sleep 4
set -a && source .env.local && set +a
curl -sc /tmp/reflections-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" -d "{\"password\":\"${DASHBOARD_PASSWORD}\"}" -o /dev/null -w "login: %{http_code}\n"

TEST_DATE="2026-01-02"
# Create
curl -sb /tmp/reflections-cookies.txt -X PUT "http://localhost:3000/api/reflections/${TEST_DATE}" \
  -H "content-type: application/json" -d '{"raw_text":"First draft of a test reflection."}' | tee /tmp/reflections-create.json
echo ""
# Fetch single, fresh
curl -sb /tmp/reflections-cookies.txt "http://localhost:3000/api/reflections/${TEST_DATE}" | python3 -m json.tool
# List should include it
curl -sb /tmp/reflections-cookies.txt http://localhost:3000/api/reflections | python3 -m json.tool
```

Expected: PUT returns 200 with the row (`entry_date: "2026-01-02"`, `raw_text: "First draft of a test reflection."`). GET single returns the same. GET list returns `{entries, today}` where `entries` includes the test row and `today` is today's actual SGT date (e.g. `2026-07-18`), NOT the fabricated test date.

- [ ] **Step 5: Live-verify the conflict-detection path — this is the core stability guarantee, test it precisely**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
TEST_DATE="2026-01-02"

# Simulate a concurrent Telegram-style append via a direct DB write, bypassing
# the app entirely — exactly the class of external change the conflict check
# exists to catch.
curl -s -X PATCH "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/journal_entries?user_id=eq.${USER_ID}&entry_date=eq.${TEST_DATE}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "content-type: application/json" -H "Prefer: return=representation" \
  -d '{"raw_text":"First draft of a test reflection.\n\nAppended from Telegram."}' | python3 -m json.tool

# Attempt a save as if from a native editor that is still showing the
# ORIGINAL (now-stale) text — this must be rejected, not silently overwritten.
curl -sb /tmp/reflections-cookies.txt -o /tmp/reflections-conflict.json -w "conflict save status: %{http_code}\n" \
  -X PUT "http://localhost:3000/api/reflections/${TEST_DATE}" \
  -H "content-type: application/json" \
  -d '{"raw_text":"First draft. Edited natively.","expected_previous_text":"First draft of a test reflection."}'
cat /tmp/reflections-conflict.json
echo ""

# Confirm the DB still holds the Telegram-appended text, proving the rejected
# save did NOT touch it.
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/journal_entries?user_id=eq.${USER_ID}&entry_date=eq.${TEST_DATE}&select=raw_text" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
echo ""

# Now perform the deliberate "Overwrite anyway" path (no expected_previous_text) and confirm it succeeds.
curl -sb /tmp/reflections-cookies.txt -X PUT "http://localhost:3000/api/reflections/${TEST_DATE}" \
  -H "content-type: application/json" -d '{"raw_text":"Deliberately overwritten by user choice."}'
```

Expected: the conflict save returns `409` with body `{"error":"conflict","current_text":"First draft of a test reflection.\n\nAppended from Telegram."}`. The DB-read immediately after confirms `raw_text` is STILL the Telegram-appended version (unchanged by the rejected save). The final unconditional PUT returns `200` with `raw_text: "Deliberately overwritten by user choice."`.

- [ ] **Step 6: Clean up the test entry**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
curl -s -X DELETE "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/journal_entries?user_id=eq.${USER_ID}&entry_date=eq.2026-01-02" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -o /dev/null -w "cleanup: %{http_code}\n"
curl -sb /tmp/reflections-cookies.txt http://localhost:3000/api/reflections | grep -c "2026-01-02" || echo "0 (correctly removed)"
```

Expected: `cleanup: 204`, and the test date no longer appears in the list.

- [ ] **Step 7: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add app/api/reflections/route.ts "app/api/reflections/[date]/route.ts"
git commit -m "feat: GET/PUT reflections API — list, fetch-fresh, upsert with optimistic-conflict detection"
```

---

### Task 2: useReflections client hook

**Files:**
- Create: `lib/useReflections.ts`

- [ ] **Step 1: Write the hook**

Create `lib/useReflections.ts`:

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';

export interface ReflectionEntry {
  id: string | null;
  entry_date: string;
  raw_text: string;
  created_at: string | null;
}

export interface ReflectionsData {
  entries: ReflectionEntry[];
  today: string;
}

export type SaveResult =
  | { ok: true }
  | { ok: false; conflictText: string }
  | { ok: false; conflictText: null };

async function fetchReflections(): Promise<ReflectionsData | null> {
  const res = await fetch('/api/reflections');
  if (!res.ok) { console.error('fetchReflections failed', res.status, await res.text()); return null; }
  return res.json();
}

// Module-level, not component state: survives ReflectionsBoard unmounting
// and remounting on client-side navigation away from and back to
// /reflections (same fix, same reasoning, as useHabits.ts's habitsCache —
// see that file's comment). Lets a revisit render the last-known list
// immediately instead of a "Loading…" flash, while load() below still fires
// in the background to catch anything that changed elsewhere since the last
// visit (e.g. a new Telegram reflection).
let reflectionsCache: ReflectionsData | null = null;

/**
 * Fetch one date's entry fresh from the server — deliberately never cached.
 * Called the instant an editor opens for a given date, so editing always
 * starts from the true current server state (which may include a
 * Telegram-appended addition since the list was last loaded) rather than a
 * possibly-stale list snapshot.
 */
export async function fetchEntryFresh(date: string): Promise<{ raw_text: string }> {
  const res = await fetch(`/api/reflections/${date}`);
  if (!res.ok) { console.error('fetchEntryFresh failed', res.status, await res.text()); return { raw_text: '' }; }
  return res.json();
}

export function useReflections() {
  const [data, setData] = useState<ReflectionsData | null>(reflectionsCache);

  const load = useCallback(async () => {
    const fresh = await fetchReflections();
    if (fresh) { reflectionsCache = fresh; setData(fresh); }
  }, []);

  // load()'s setData call happens after an await, not synchronously during
  // this effect's execution — same lint situation as useHabits.ts's mount
  // effect (see that file's comment for the full explanation).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional, see useHabits.ts for the same pattern/reasoning
  useEffect(() => { load(); }, [load]);

  /**
   * expectedPreviousText: the text the editor started from. Pass it for a
   * normal save (conflict-checked); omit it (undefined) for an unconditional
   * overwrite (the "Overwrite anyway" path, used only after a 409 has
   * already shown the caller what they'd be discarding).
   */
  const saveEntry = useCallback(async (
    date: string,
    rawText: string,
    expectedPreviousText?: string,
  ): Promise<SaveResult> => {
    const res = await fetch(`/api/reflections/${date}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        expectedPreviousText === undefined
          ? { raw_text: rawText }
          : { raw_text: rawText, expected_previous_text: expectedPreviousText },
      ),
    });
    if (res.status === 409) {
      const json = await res.json();
      return { ok: false, conflictText: json.current_text };
    }
    if (!res.ok) {
      console.error('saveEntry failed', res.status, await res.text());
      return { ok: false, conflictText: null };
    }
    load(); // refresh the list so the saved text (and its preview) is current
    return { ok: true };
  }, [load]);

  return { data, saveEntry };
}
```

- [ ] **Step 2: Type-check and lint**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run lint`
Expected: no errors. If `react-hooks/set-state-in-effect` fires anyway despite the disable comment, confirm the comment is on the line immediately above the `useEffect` call (not above `load`'s definition) — same placement as the working one in `lib/useHabits.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add lib/useReflections.ts
git commit -m "feat: useReflections client hook — cached list fetch, fresh single-entry fetch, conflict-aware save"
```

---

### Task 3: ReflectionsBoard component, page route, nav entry

**Files:**
- Create: `components/reflections/ReflectionsBoard.tsx`
- Create: `app/reflections/page.tsx`
- Modify: `components/dashboard/TopRail.tsx`

- [ ] **Step 1: Write the component**

Create `components/reflections/ReflectionsBoard.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useReflections, fetchEntryFresh, type SaveResult } from '@/lib/useReflections';

function formatEntryDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

type SaveEntryFn = (date: string, text: string, expected?: string) => Promise<SaveResult>;

/**
 * Core textarea-plus-save editor, shared by the always-open "Today" card and
 * any expanded past entry. Tracks its own conflict-comparison baseline
 * separately from the initial prop: after every successful save, `baseline`
 * updates to the text that was just written, so a SECOND save in the same
 * session compares against the last known-good state rather than the
 * original mount-time value (which would otherwise cause every second save
 * in a row to falsely conflict against itself).
 */
function ReflectionEditor({ date, initialText, saveEntry }: {
  date: string;
  initialText: string;
  saveEntry: SaveEntryFn;
}) {
  const [text, setText] = useState(initialText);
  const [baseline, setBaseline] = useState(initialText);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflictText, setConflictText] = useState<string | null>(null);

  const doSave = async (force: boolean) => {
    setStatus('saving');
    const result = await saveEntry(date, text, force ? undefined : baseline);
    if (result.ok) {
      setStatus('saved');
      setConflictText(null);
      setBaseline(text);
    } else if (result.conflictText !== null) {
      setStatus('idle');
      setConflictText(result.conflictText);
    } else {
      setStatus('error');
    }
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus('idle'); }}
        placeholder="What happened today?"
        style={{
          width: '100%', minHeight: 120, lineHeight: 1.5, color: '#111',
          resize: 'vertical', padding: '12px 14px', border: '1px solid rgba(17,17,17,.1)',
          borderRadius: 6, background: '#fff', boxSizing: 'border-box',
          fontFamily: "'Inter Tight', sans-serif", outline: 'none',
          // 16px, not smaller — iOS Safari auto-zooms the whole page on
          // focus for any input under 16px (bit us on the chat input and
          // twice in Habits already; same fix here).
          fontSize: 16,
        }}
      />
      {conflictText !== null && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 6,
          background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.2)',
        }}>
          <div style={{ font: "700 12px 'Inter Tight', sans-serif", color: '#b3261e', marginBottom: 6 }}>
            This entry changed since you opened it — probably from Telegram. Current version:
          </div>
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: '#111', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
            {conflictText || '(empty)'}
          </div>
          <button
            onClick={() => doSave(true)}
            style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', background: '#b3261e', color: '#fff',
              font: "700 12px 'Inter Tight', sans-serif", cursor: 'pointer',
            }}
          >Overwrite anyway</button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button
          onClick={() => doSave(false)}
          disabled={status === 'saving'}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', background: '#9a7a2e', color: '#fff',
            font: "700 13px 'Inter Tight', sans-serif", cursor: status === 'saving' ? 'default' : 'pointer',
            opacity: status === 'saving' ? .6 : 1,
          }}
        >Save</button>
        {status === 'saved' && <span style={{ font: "600 12px 'Inter Tight', sans-serif", color: '#4b7a4f' }}>Saved</span>}
        {status === 'error' && <span style={{ font: "600 12px 'Inter Tight', sans-serif", color: '#b3261e' }}>Save failed — try again</span>}
      </div>
    </div>
  );
}

function TodayCard({ today, saveEntry }: { today: string; saveEntry: SaveEntryFn }) {
  const [initialText, setInitialText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEntryFresh(today).then((e) => { if (!cancelled) setInitialText(e.raw_text); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh-fetch on mount/date-change, same pattern as useHabits.ts's load()
  }, [today]);

  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid rgba(17,17,17,.08)' }}>
      <div style={{
        font: "700 12px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)',
        letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10,
      }}>Today — {formatEntryDate(today)}</div>
      {initialText === null ? (
        <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
      ) : (
        <ReflectionEditor key={today} date={today} initialText={initialText} saveEntry={saveEntry} />
      )}
    </div>
  );
}

function PastEntryRow({ entry, saveEntry }: {
  entry: { entry_date: string; raw_text: string };
  saveEntry: SaveEntryFn;
}) {
  const [expanded, setExpanded] = useState(false);
  const [freshText, setFreshText] = useState<string | null>(null);

  const expand = () => {
    setExpanded(true);
    fetchEntryFresh(entry.entry_date).then((e) => setFreshText(e.raw_text));
  };

  const preview = entry.raw_text.length > 150 ? `${entry.raw_text.slice(0, 150)}…` : entry.raw_text;

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid rgba(17,17,17,.06)' }}>
      <div style={{ font: "700 13px 'Inter Tight', sans-serif", color: '#9a7a2e', marginBottom: 6 }}>
        {formatEntryDate(entry.entry_date)}
      </div>
      {!expanded ? (
        <div
          onClick={expand}
          style={{ font: "500 14px 'Inter Tight', sans-serif", color: '#111', whiteSpace: 'pre-wrap', cursor: 'pointer' }}
        >
          {preview || <span style={{ color: 'rgba(17,17,17,.35)' }}>(empty — click to write)</span>}
        </div>
      ) : freshText === null ? (
        <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
      ) : (
        <ReflectionEditor key={entry.entry_date} date={entry.entry_date} initialText={freshText} saveEntry={saveEntry} />
      )}
    </div>
  );
}

export default function ReflectionsBoard() {
  const { data, saveEntry } = useReflections();
  const pastEntries = data ? data.entries.filter((e) => e.entry_date !== data.today) : [];

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '32px 16px 56px', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '32px 24px 28px',
      }}>
        <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', marginBottom: 28 }}>
          Reflections
        </div>

        {!data && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
        )}

        {data && (
          <>
            <TodayCard today={data.today} saveEntry={saveEntry} />
            {pastEntries.length === 0 ? (
              <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
                No past reflections yet — write today&apos;s above, or send one via Telegram.
              </div>
            ) : (
              <div>
                {pastEntries.map((entry) => (
                  <PastEntryRow key={entry.entry_date} entry={entry} saveEntry={saveEntry} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the page route**

Create `app/reflections/page.tsx`:

```tsx
import ReflectionsBoard from '@/components/reflections/ReflectionsBoard';

export default function ReflectionsPage() {
  return <ReflectionsBoard />;
}
```

- [ ] **Step 3: Add the nav entry**

Read `components/dashboard/TopRail.tsx` first — it currently has a two-entry `TABS` array (Tasks, Habits). Modify only the `TABS` array:

```ts
const TABS = [
  { href: '/tasks', label: 'Tasks' },
  { href: '/habits', label: 'Habits' },
  { href: '/reflections', label: 'Reflections' },
];
```

Leave the rest of the file untouched.

- [ ] **Step 4: Type-check, lint, build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors; `/reflections` appears in the build's route table alongside `/tasks` and `/habits`.

- [ ] **Step 5: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add components/reflections/ReflectionsBoard.tsx app/reflections/page.tsx components/dashboard/TopRail.tsx
git commit -m "feat: ReflectionsBoard component, /reflections route, nav entry"
```

---

### Task 4: Telegram wording tweak + live end-to-end webhook verification

**Files:**
- Modify: `app/api/telegram/webhook/route.ts:151`

- [ ] **Step 1: Update the reply wording for naming consistency**

In `app/api/telegram/webhook/route.ts`, the journal-kind reply currently reads (line 151):

```ts
      } else if (c.kind === 'journal') {
        await tgSendMessage(chatId, `📓 Journaled for today.${flag}`);
```

Change the message text only (routing/classification logic is untouched — verified working already):

```ts
      } else if (c.kind === 'journal') {
        await tgSendMessage(chatId, `📓 Reflection saved for today.${flag}`);
```

- [ ] **Step 2: Type-check and build**

Run: `cd /Users/brendanang/Documents/personal-os && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 3: Live-verify the real webhook route end-to-end**

This exercises the actual production code path — real secret-token auth, real `processCapture()`, real DB write — via a synthetic Telegram update payload posted directly to the webhook route (the standard way to test a webhook handler without needing a real incoming message).

Uses a deliberately fake `chat_id` (`1`), NOT the real configured Telegram chat — this avoids sending a real, unrequested message to Brendan's actual Telegram while he's away from his phone. `tgSendMessage`'s failure against a fake chat_id is caught internally by the webhook's own per-item try/catch (see `app/api/telegram/webhook/route.ts`'s reply loop) and does not affect the DB write being tested, which happens earlier and unconditionally. Expect a harmless "telegram sendMessage failed" line in the dev server log — that's this deliberate choice, not a bug.

The test text is worded to unambiguously read as a diary reflection ("Reflecting on today...") so it reliably classifies as `journal` via both the AI classifier and its regex fallback, rather than risking an ambiguous phrase that could misclassify as a task.

Today's entry may already have real content (either from the user's own prior writing, or none at all) — capture it first and restore it exactly afterward, since the capture pipeline APPENDS rather than replaces, and a naive cleanup would either destroy real content or leave test content behind.

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a

# Dev server should still be running from Task 1; if not, restart it the same way:
# (lsof -ti:3000 | xargs kill -9 2>/dev/null; true); npm run dev > /tmp/personal-os-dev.log 2>&1 & disown; sleep 4

TODAY=$(curl -sb /tmp/reflections-cookies.txt http://localhost:3000/api/reflections | python3 -c "import json,sys; print(json.load(sys.stdin)['today'])")
echo "Server-side today: ${TODAY}"
curl -sb /tmp/reflections-cookies.txt "http://localhost:3000/api/reflections/${TODAY}" -o /tmp/reflections-pretest.json
cat /tmp/reflections-pretest.json
echo ""

curl -s -X POST http://localhost:3000/api/telegram/webhook \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: ${TELEGRAM_WEBHOOK_SECRET}" \
  -d "{\"message\":{\"from\":{\"id\":${TELEGRAM_USER_ID}},\"chat\":{\"id\":1},\"text\":\"Reflecting on today: __plan_test_reflection__ automated pipeline check.\"}}" \
  -w "\nwebhook status: %{http_code}\n"
```

Expected: `webhook status: 200`.

```bash
# Confirm it landed in journal_entries for today via the REAL webhook -> processCapture path
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/journal_entries?user_id=eq.${USER_ID}&entry_date=eq.${TODAY}&select=raw_text" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

Expected: `raw_text` contains `__plan_test_reflection__ automated pipeline check.` (classified as journal-kind, routed to `journal_entries`, appended after any pre-existing text for today).

```bash
# Confirm it's visible through the dashboard's own list endpoint too (closes
# the loop: Telegram -> DB -> what the Reflections page would actually show)
curl -sb /tmp/reflections-cookies.txt http://localhost:3000/api/reflections | grep -c "__plan_test_reflection__"
```

Expected: `1`.

- [ ] **Step 4: Restore today's entry to exactly its pre-test state**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
TODAY=$(curl -sb /tmp/reflections-cookies.txt http://localhost:3000/api/reflections | python3 -c "import json,sys; print(json.load(sys.stdin)['today'])")

python3 -c "
import json
pre = json.load(open('/tmp/reflections-pretest.json'))
print(json.dumps({'raw_text': pre['raw_text']}))
" > /tmp/reflections-restore.json
curl -sb /tmp/reflections-cookies.txt -X PUT "http://localhost:3000/api/reflections/${TODAY}" \
  -H "content-type: application/json" --data-binary @/tmp/reflections-restore.json

# Byte-for-byte confirm the restore matches the pre-test snapshot exactly
diff \
  <(python3 -c "import json; print(json.load(open('/tmp/reflections-pretest.json'))['raw_text'])") \
  <(curl -sb /tmp/reflections-cookies.txt "http://localhost:3000/api/reflections/${TODAY}" | python3 -c "import json,sys; print(json.load(sys.stdin)['raw_text'])")
echo "diff exit code: $?"
```

Expected: `diff exit code: 0` (no differences) — today's entry is back to exactly what it was before this test ran.

- [ ] **Step 5: Commit**

```bash
cd /Users/brendanang/Documents/personal-os
git add app/api/telegram/webhook/route.ts
git commit -m "feat: Telegram reflection reply wording (Journaled -> Reflection saved) for naming consistency"
```

---

### Task 5: End-to-end browser verification (including the live conflict UI), cleanup, deploy

**Files:** none (verification + deploy only)

- [ ] **Step 1: Regression check**

Run: `cd /Users/brendanang/Documents/personal-os && npm test`
Expected: every existing test file still passes (no new test files this feature — there's no extracted pure-logic module the way `habitStats`/`habitHeatmap` were; the one new piece of real logic, the conflict check, is a single inline comparison already covered by Task 1's live API verification, consistent with how this codebase tests routes live rather than with mocked-DB unit tests).

- [ ] **Step 2: Seed two fixed past entries for browser testing**

With the dev server still running (restart via the pattern in Task 1 Step 4 if needed):

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
curl -sb /tmp/reflections-cookies.txt -X PUT "http://localhost:3000/api/reflections/2026-01-03" \
  -H "content-type: application/json" -d '{"raw_text":"__plan_test__ A past reflection for browser testing."}'
echo ""
curl -sb /tmp/reflections-cookies.txt -X PUT "http://localhost:3000/api/reflections/2026-01-04" \
  -H "content-type: application/json" -d '{"raw_text":"__plan_test__ Conflict-UI baseline text."}'
```

Expected: both return 200.

- [ ] **Step 3: Browser-verify on desktop viewport**

Open `http://localhost:3000/reflections` in a browser at 1280px width, log in if needed. Confirm:
- "Reflections" tab appears in the top nav after Tasks and Habits, and navigates correctly.
- The "Today" card is visible above the list, pre-filled with whatever today's real entry currently holds (or empty with the "What happened today?" placeholder if none).
- Typing text into the Today card and clicking Save shows "Saved" next to the button. Reload the page — the text is still there (round-tripped through the DB, not just local state).
- The two `2026-01-03` / `2026-01-04` seeded entries appear in the past-entries list below, most recent first, each showing a formatted date and a text preview.
- Clicking a past entry's preview expands it into the same editor UI as the Today card, showing the full text. Edit it, click Save, confirm "Saved" appears; reload and re-expand to confirm the edit persisted.

- [ ] **Step 4: Browser-verify the conflict UI live — this is the highest-stakes piece of the feature, confirm it actually works in the UI, not just via curl**

1. In the browser, click to expand the `2026-01-04` entry ("Conflict-UI baseline text.").
2. Without reloading or closing that editor, run this in a terminal to simulate a concurrent Telegram-style append landing on the SAME entry while the browser still has the old text loaded:

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
curl -s -X PATCH "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/journal_entries?user_id=eq.${USER_ID}&entry_date=eq.2026-01-04" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "content-type: application/json" \
  -d '{"raw_text":"__plan_test__ Conflict-UI baseline text.\n\nAppended concurrently."}'
```

3. Back in the browser (editor still open, still showing the old text), type something new into the textarea and click Save.
4. Confirm the conflict panel appears: red-tinted box showing "This entry changed since you opened it — probably from Telegram" with the current server text (including "Appended concurrently.") displayed, and an "Overwrite anyway" button. Confirm the save was NOT silently accepted.
5. Click "Overwrite anyway". Confirm it succeeds ("Saved" appears, conflict panel clears). Reload the page, re-expand `2026-01-04`, and confirm the text now shows what you typed in step 3 (the deliberate overwrite went through).

- [ ] **Step 5: Browser-verify on mobile viewport**

Resize to 375×812. Confirm:
- Nav tab, Today card, and past-entries list are all usable at this width — no horizontal page overflow (this app has hit real flex/overflow bugs before; a quick visual check here is cheap insurance).
- Tapping into the Today textarea does not trigger an iOS-style zoom (font-size is already 16px in the code — confirm visually anyway, this exact bug has recurred twice already this session for other inputs).
- Expanding a past entry and saving works the same as desktop.

- [ ] **Step 6: Clean up all test entries**

```bash
cd /Users/brendanang/Documents/personal-os
set -a && source .env.local && set +a
for D in 2026-01-02 2026-01-03 2026-01-04; do
  curl -s -X DELETE "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/journal_entries?user_id=eq.${USER_ID}&entry_date=eq.${D}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -o /dev/null -w "cleanup ${D}: %{http_code}\n"
done
curl -sb /tmp/reflections-cookies.txt http://localhost:3000/api/reflections | grep -c "__plan_test__" || echo "0 (correctly removed)"
```

Expected: three `204`s, and the final check shows no remaining test markers. Also re-confirm today's real entry still matches Task 4 Step 4's restored state (it wasn't touched by this task, but worth a final glance since it's the one entry with real user data in play tonight).

- [ ] **Step 7: Stop the local dev server**

```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; true
```

- [ ] **Step 8: Deploy to production**

```bash
cd /Users/brendanang/Documents/personal-os
npx --yes vercel deploy --prod --yes
```

Expected: deployment reports `readyState: "READY"`, `target: "production"`.

- [ ] **Step 9: Confirm the production alias points at the new deployment**

```bash
npx --yes vercel inspect personal-os-sigma-seven.vercel.app 2>&1 | grep -iE "url|created"
```

Expected: the `url` shown matches the deployment URL from Step 8 (not an older one), `created` timestamp is recent.

- [ ] **Step 10: Smoke-check production**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://personal-os-sigma-seven.vercel.app/login
```

Expected: `200`.

- [ ] **Step 11: Final commit if anything changed since Task 4's commit**

```bash
cd /Users/brendanang/Documents/personal-os
git status
```

If clean (expected — this task is verification/data/deploy, not code), nothing to commit. If any fix was needed during browser verification, commit it with an appropriately descriptive message before deploying (do not deploy uncommitted changes).
