# Personal OS — Phase 0 (Foundation) + Phase 1 (Capture + Tasks + Timers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed Next.js dashboard + Telegram capture bot: voice/text notes become AI-classified tasks/journal/goals; a task board with Kanban/List/Smart views and projected-vs-actual timers.

**Architecture:** Next.js 15 App Router on Vercel, Supabase Postgres (service-role from server routes only, RLS deny-all), single-password HMAC-cookie auth. Telegram webhook → Whisper → Claude classifier (OpenAI fallback → regex last resort) → routed DB writes. AI never runs on page load — only capture, cron, or explicit ask. All day-boundary logic uses `localDateKey()` in `Asia/Singapore`.

**Tech Stack:** Next.js 15 (TS strict, Tailwind v4), @supabase/supabase-js, Vitest, Telegram Bot API (raw fetch), Anthropic + OpenAI APIs (raw fetch), Vercel cron.

**Spec:** `docs/superpowers/specs/2026-07-08-personal-os-design.md`

**Conventions for every task:**
- Project root: `/Users/brendanang/Documents/personal-os`
- Never write `.catch(() => {})` — log every error
- Server-only secrets never imported into client components
- Phases 2–4 (habits/nudges, goals/journal UI, memory) get their own plans after P1 ships

---

## Phase 0 — Foundation

### Task 1: Scaffold Next.js project + Vitest

**Files:**
- Create: entire Next.js scaffold, `vitest.config.ts`, `.env.example`

- [ ] **Step 1: Scaffold (project dir already contains docs/ + .git, so scaffold in a temp dir and merge)**

```bash
cd /Users/brendanang/Documents/personal-os
npx create-next-app@latest app-tmp --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
rsync -a --exclude=.git app-tmp/ ./
rm -rf app-tmp
npm install
```

- [ ] **Step 2: Install runtime + test deps**

```bash
npm install @supabase/supabase-js
npm install -D vitest
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
});
```

- [ ] **Step 4: Add test script to `package.json` scripts**

```json
"test": "vitest run"
```

- [ ] **Step 5: Create `.env.example` (real values go in `.env.local`, gitignored)**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_API_KEY=
OPENAI_CLASSIFIER_MODEL=gpt-4o-mini
AUTH_SECRET=
DASHBOARD_PASSWORD=
API_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_USER_ID=
CRON_SECRET=
USER_TIMEZONE=Asia/Singapore
USER_ID=brendan
```

- [ ] **Step 6: Verify build and empty test run**

Run: `npm run build && npm test`
Expected: build succeeds; vitest reports "no test files found" (exit 0 with `--passWithNoTests`; add that flag to the test script if it exits 1)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js 15 + vitest"
```

---

### Task 2: Design tokens + shell components (Panel, TopRail, layout)

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Create: `components/ui/Panel.tsx`, `components/dashboard/TopRail.tsx`

- [ ] **Step 1: Replace `app/globals.css` with dark theme + oklch tokens**

```css
@import "tailwindcss";

:root {
  --ink-0: oklch(0.12 0.012 250); /* page background */
  --ink-1: oklch(0.17 0.012 250); /* card background */
  --ink-2: oklch(0.26 0.012 250); /* borders */
  --ink-3: oklch(0.58 0.01 250);  /* muted text */
  --ink-4: oklch(0.88 0.005 250); /* primary text */
  --accent: oklch(0.85 0.14 165);
  --ok: oklch(0.75 0.15 155);
  --warn: oklch(0.8 0.15 85);
  --danger: oklch(0.65 0.2 25);
}

body {
  background: var(--ink-0);
  color: var(--ink-4);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

.mono { font-family: var(--font-geist-mono), monospace; }
```

- [ ] **Step 2: Create `components/ui/Panel.tsx`**

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
          {title && <h2 className="mono text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--ink-3)' }}>{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Create `components/dashboard/TopRail.tsx` (client — live SGT clock)**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/', label: 'HOME' },
  { href: '/tasks', label: 'TASKS' },
  { href: '/review', label: 'REVIEW' },
];

export default function TopRail() {
  const pathname = usePathname();
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () =>
      setTime(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date()));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <nav className="flex items-center justify-between border-b px-6 py-3" style={{ borderColor: 'var(--ink-2)' }}>
      <span className="mono text-sm" style={{ color: 'var(--accent)' }}>● BRENDAN OS</span>
      <div className="flex gap-6">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="mono text-xs tracking-[0.2em]"
            style={{ color: pathname === t.href ? 'var(--ink-4)' : 'var(--ink-3)' }}>
            {t.label}
          </Link>
        ))}
      </div>
      <span className="mono text-sm">{time}</span>
    </nav>
  );
}
```

- [ ] **Step 4: Replace `app/layout.tsx` body to include the rail (keep the font setup create-next-app generated)**

```tsx
// inside RootLayout return, replacing the bare {children}:
<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
  <TopRail />
  <main className="mx-auto max-w-6xl p-6">{children}</main>
</body>
```

Add `import TopRail from '@/components/dashboard/TopRail';` and set metadata title to `Brendan OS`.

- [ ] **Step 5: Replace `app/page.tsx` with a placeholder home**

```tsx
import Panel from '@/components/ui/Panel';

export default function Home() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="01 // Session"><p style={{ color: 'var(--ink-3)' }}>Tasks land here in Phase 1.</p></Panel>
      <Panel title="02 // Habits"><p style={{ color: 'var(--ink-3)' }}>Habit tracker lands in Phase 2.</p></Panel>
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm run dev` → open http://localhost:3000
Expected: dark page, top rail with three tabs and a ticking SGT clock, two glass panels.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: design tokens + Panel/TopRail shell"
```

---

### Task 3: Supabase project + schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Manual — create the Supabase project**

At supabase.com: new project → copy Project URL, anon key, service role key into `.env.local`. Enable the `vector` extension (Database → Extensions) — used in Phase 4, cheap to enable now.

- [ ] **Step 2: Create `supabase/migrations/0001_init.sql`**

```sql
create extension if not exists vector;

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  urgency text not null default 'this_week'
    check (urgency in ('today','this_week','this_month','someday')),
  key boolean not null default false,
  priority_score double precision not null default 0,
  rank_pinned boolean not null default false,
  time_estimate_min integer,
  actual_time_min integer not null default 0,
  tags text[] not null default '{}',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table timer_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  task_id uuid not null references tasks(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  emoji text,
  sub_tasks jsonb not null default '[]',
  schedule_days int[] not null default '{0,1,2,3,4,5,6}',
  nudge_time time,
  nudge_message text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  habit_id uuid not null references habits(id) on delete cascade,
  log_date date not null,
  done_subtasks jsonb not null default '[]',
  completed boolean not null default false,
  source text not null default 'dashboard',
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create table nudge_snoozes (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  log_date date not null,
  snoozed_until timestamptz not null
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  scope text not null check (scope in ('week','month')),
  title text not null,
  completed boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  entry_date date not null,
  raw_text text not null default '',
  ai_summary text,
  mood text,
  focus text,
  created_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  week_start date not null,
  wins text, slipped text, open_loops text, follow_ups text,
  content_shipped text, health_pattern text, next_week_top3 text,
  sealed_at timestamptz,
  unique (user_id, week_start)
);

create table raw_captures (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text not null,
  raw_text text not null,
  audio_url text,
  classification jsonb,
  override jsonb,
  llm_source text,
  routed_to text,
  routed_id uuid,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_type text not null,
  source_id uuid,
  text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index on memory_chunks using ivfflat (embedding vector_cosine_ops);

-- RLS deny-all: no policies. Server routes use the service role key, which bypasses RLS.
alter table tasks enable row level security;
alter table timer_sessions enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
alter table nudge_snoozes enable row level security;
alter table goals enable row level security;
alter table journal_entries enable row level security;
alter table weekly_reviews enable row level security;
alter table raw_captures enable row level security;
alter table audit_log enable row level security;
alter table memory_chunks enable row level security;

create index tasks_open_idx on tasks (user_id, completed_at) where completed_at is null;
create index timer_sessions_task_idx on timer_sessions (task_id);
create index raw_captures_routed_idx on raw_captures (routed_id);
```

- [ ] **Step 3: Apply the migration**

Paste the file into Supabase SQL Editor and run (or `npx supabase db push` if the CLI is linked).
Expected: "Success. No rows returned."

- [ ] **Step 4: Verify tables exist**

In Supabase Table Editor: confirm `tasks`, `timer_sessions`, `habits`, `raw_captures` all appear with RLS shown as enabled.

- [ ] **Step 5: Commit**

```bash
git add supabase && git commit -m "feat: initial schema migration"
```

---

### Task 4: `localDateKey()` — SGT day boundaries (TDD)

**Files:**
- Create: `lib/dates.ts`
- Test: `tests/dates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { localDateKey } from '@/lib/dates';

describe('localDateKey', () => {
  it('is still "today" at 23:59 SGT (15:59 UTC)', () => {
    expect(localDateKey(new Date('2026-07-08T15:59:00Z'), 'Asia/Singapore')).toBe('2026-07-08');
  });
  it('rolls over at SGT midnight (16:00 UTC), not UTC midnight', () => {
    expect(localDateKey(new Date('2026-07-08T16:00:00Z'), 'Asia/Singapore')).toBe('2026-07-09');
  });
  it('formats as YYYY-MM-DD', () => {
    expect(localDateKey(new Date('2026-01-05T00:00:00Z'), 'Asia/Singapore')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/dates`

- [ ] **Step 3: Create `lib/dates.ts`**

```ts
const DEFAULT_TZ = process.env.USER_TIMEZONE ?? 'Asia/Singapore';

/** YYYY-MM-DD for the user's local day. Use for EVERY "what day is it" decision. */
export function localDateKey(d: Date = new Date(), timeZone: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` — Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts tests/dates.test.ts && git commit -m "feat: localDateKey with SGT day boundary (TDD)"
```

---

### Task 5: Auth gate — HMAC cookie, middleware, login page

**Files:**
- Create: `lib/auth.ts`, `middleware.ts`, `app/login/page.tsx`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`
- Test: `tests/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/auth';

const SECRET = 'test-secret';

describe('session tokens', () => {
  it('round-trips a valid token', async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });
  it('rejects a tampered token', async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token + 'x', SECRET)).toBe(false);
  });
  it('rejects wrong secret, expired, and missing tokens', async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, 'other')).toBe(false);
    expect(await verifySessionToken(await createSessionToken(SECRET, -1000), SECRET)).toBe(false);
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` — Expected: FAIL — cannot resolve `@/lib/auth`

- [ ] **Step 3: Create `lib/auth.ts` (Web Crypto only — must run in edge middleware)**

```ts
const enc = new TextEncoder();

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const SESSION_COOKIE = 'pos_session';

export async function createSessionToken(secret: string, ttlMs = 30 * 24 * 60 * 60 * 1000): Promise<string> {
  const exp = Date.now() + ttlMs;
  return `${exp}.${await hmacHex(String(exp), secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  if (!expStr || !sig) return false;
  if (!Number(expStr) || Number(expStr) < Date.now()) return false;
  return (await hmacHex(expStr, secret)) === sig;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` — Expected: all pass

- [ ] **Step 5: Create `middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth';

const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/api/telegram/webhook', '/api/cron/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.headers.get('x-api-secret') === process.env.API_SECRET) return NextResponse.next();
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET!);
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

Note: `/api/telegram/webhook` and `/api/cron/*` are public here but enforce their own secrets (webhook secret header / CRON_SECRET bearer) inside the route.

- [ ] **Step 6: Create `app/api/auth/login/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!password || password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(process.env.AUTH_SECRET!), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/',
  });
  return res;
}
```

- [ ] **Step 7: Create `app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}
```

- [ ] **Step 8: Create `app/login/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push('/');
    else setError('Wrong password.');
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <Panel title="Access">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" autoFocus
            className="rounded border bg-transparent p-2"
            style={{ borderColor: 'var(--ink-2)' }}
          />
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <button type="submit" className="rounded p-2 font-medium"
            style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
            Enter
          </button>
        </form>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 9: Verify**

Set `AUTH_SECRET` (`openssl rand -hex 32`), `DASHBOARD_PASSWORD`, `API_SECRET` (`openssl rand -hex 24`) in `.env.local`. Run `npm run dev`:
- http://localhost:3000 redirects to `/login`
- wrong password → error; right password → home
- `curl -s localhost:3000/api/tasks` → 401 JSON (route doesn't exist yet, but middleware rejects first)

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: single-password auth gate (HMAC cookie + middleware)"
```

---

### Task 6: Supabase server client helper

**Files:**
- Create: `lib/supabase.ts`

- [ ] **Step 1: Create `lib/supabase.ts`**

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const USER_ID = process.env.USER_ID ?? 'brendan';

/** Service-role client. SERVER ONLY — never import from a client component. */
export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build` — Expected: success

- [ ] **Step 3: Commit**

```bash
git add lib/supabase.ts && git commit -m "feat: supabase service client helper"
```

---

### Task 7: Deploy to Vercel (Phase 0 gate)

**Files:** none (ops)

- [ ] **Step 1: Push repo to GitHub (private) and link Vercel**

```bash
gh repo create personal-os --private --source . --push
npx vercel link
```

- [ ] **Step 2: Add all `.env.example` vars to Vercel (production)**

For each var with a real value: `npx vercel env add <NAME> production`. Telegram vars can wait until Task 12 if the bot isn't created yet.

- [ ] **Step 3: Deploy**

Run: `npx vercel --prod`
Expected: live URL; visiting it shows the login page; logging in shows the placeholder dashboard.

- [ ] **Step 4: Commit any config drift and tag the phase**

```bash
git add -A && git commit -m "chore: vercel deployment config" --allow-empty
git tag phase-0
```

---

## Phase 1 — Capture + Tasks + Timers

### Task 8: Telegram helpers

**Files:**
- Create: `lib/telegram.ts`

- [ ] **Step 1: Create `lib/telegram.ts`**

```ts
const api = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function tgCall(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`${api()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`telegram ${method} failed: ${JSON.stringify(json)}`);
  return json.result;
}

export function tgSendMessage(chatId: number | string, text: string, replyMarkup?: unknown) {
  return tgCall('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup });
}

export function tgAnswerCallback(callbackQueryId: string, text: string) {
  return tgCall('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

/** Download a Telegram file (e.g. a voice note OGG) as an ArrayBuffer. */
export async function tgGetFileBuffer(fileId: string): Promise<ArrayBuffer> {
  const file = await tgCall('getFile', { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!res.ok) throw new Error(`telegram file download failed: ${res.status}`);
  return res.arrayBuffer();
}
```

- [ ] **Step 2: Verify build, commit**

```bash
npm run build && git add lib/telegram.ts && git commit -m "feat: telegram bot API helpers"
```

---

### Task 9: Classifier — Claude primary, OpenAI fallback, regex last resort (TDD)

**Files:**
- Create: `lib/ai/classify.ts`
- Test: `tests/classify.test.ts`

- [ ] **Step 1: Write the failing tests (pure functions only — no network in tests)**

```ts
import { describe, it, expect } from 'vitest';
import { parseClassification, regexClassify } from '@/lib/ai/classify';

describe('parseClassification', () => {
  it('parses valid JSON, even wrapped in prose', () => {
    const raw = 'Here you go: {"kind":"task","urgency":"today","tags":["content"],"summary":"Film reel","time_estimate_min":45}';
    const c = parseClassification(raw)!;
    expect(c.kind).toBe('task');
    expect(c.urgency).toBe('today');
    expect(c.time_estimate_min).toBe(45);
    expect(c.low_confidence).toBe(false);
  });
  it('rejects invalid enums and empty summaries', () => {
    expect(parseClassification('{"kind":"meal","urgency":"today","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","urgency":"whenever","summary":"x"}')).toBeNull();
    expect(parseClassification('{"kind":"task","urgency":"today","summary":""}')).toBeNull();
    expect(parseClassification('not json')).toBeNull();
  });
});

describe('regexClassify', () => {
  it('flags low confidence and defaults to task/this_week', () => {
    const c = regexClassify('send the proposal to the client');
    expect(c.kind).toBe('task');
    expect(c.urgency).toBe('this_week');
    expect(c.low_confidence).toBe(true);
  });
  it('detects today urgency and journal kind', () => {
    expect(regexClassify('need to do this today asap').urgency).toBe('today');
    expect(regexClassify('journal: today went well, felt focused').kind).toBe('journal');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL — cannot resolve `@/lib/ai/classify`

- [ ] **Step 3: Create `lib/ai/classify.ts`**

```ts
export type CaptureKind = 'task' | 'journal' | 'goal';
export type Urgency = 'today' | 'this_week' | 'this_month' | 'someday';

export interface Classification {
  kind: CaptureKind;
  urgency: Urgency;
  tags: string[];
  summary: string;
  time_estimate_min: number | null;
  low_confidence: boolean;
}

const KINDS: CaptureKind[] = ['task', 'journal', 'goal'];
const URGENCIES: Urgency[] = ['today', 'this_week', 'this_month', 'someday'];

const SYSTEM_PROMPT = `You classify one captured note from the user's phone into strict JSON.
Return ONLY a JSON object:
{"kind":"task"|"journal"|"goal","urgency":"today"|"this_week"|"this_month"|"someday","tags":string[] (1-3 lowercase words),"summary":string (imperative, <=80 chars),"time_estimate_min":number|null}
- "task" = a single actionable item. "journal" = reflection/diary about the day. "goal" = an outcome for the week/month, not one action.
- time_estimate_min: honest working-time estimate for tasks (the user has ADHD and underestimates); null for journal/goal.
- Recent corrections the user made to past classifications are provided — match their judgment.`;

export function parseClassification(raw: string): Classification | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (!KINDS.includes(obj.kind) || !URGENCIES.includes(obj.urgency)) return null;
    if (typeof obj.summary !== 'string' || !obj.summary.trim()) return null;
    return {
      kind: obj.kind,
      urgency: obj.urgency,
      tags: Array.isArray(obj.tags) ? obj.tags.filter((t: unknown): t is string => typeof t === 'string').slice(0, 3) : [],
      summary: obj.summary.trim().slice(0, 120),
      time_estimate_min: typeof obj.time_estimate_min === 'number' ? Math.round(obj.time_estimate_min) : null,
      low_confidence: false,
    };
  } catch {
    return null;
  }
}

export function regexClassify(text: string): Classification {
  const lower = text.toLowerCase();
  const kind: CaptureKind =
    /\b(journal|diary|reflect(ing|ion)?|felt|grateful)\b/.test(lower) ? 'journal'
    : /\b(goal|this month i want|by end of)\b/.test(lower) ? 'goal'
    : 'task';
  const urgency: Urgency =
    /\b(today|tonight|asap|right now|urgent)\b/.test(lower) ? 'today'
    : /\bthis week\b/.test(lower) ? 'this_week'
    : /\bthis month\b/.test(lower) ? 'this_month'
    : /\b(someday|one day|eventually)\b/.test(lower) ? 'someday'
    : 'this_week';
  return {
    kind, urgency, tags: [],
    summary: text.trim().slice(0, 120),
    time_estimate_min: null,
    low_confidence: true,
  };
}

function userContent(text: string, overrides: string[]): string {
  return `Recent corrections (was → corrected):\n${overrides.join('\n') || '(none)'}\n\nNote:\n${text}`;
}

async function claudeClassify(text: string, overrides: string[]): Promise<Classification | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent(text, overrides) }],
    }),
  });
  if (!res.ok) {
    console.error('anthropic classify failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return parseClassification(json.content?.[0]?.text ?? '');
}

async function openaiClassify(text: string, overrides: string[]): Promise<Classification | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CLASSIFIER_MODEL ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent(text, overrides) },
      ],
    }),
  });
  if (!res.ok) {
    console.error('openai classify failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return parseClassification(json.choices?.[0]?.message?.content ?? '');
}

export async function classifyCapture(
  text: string, overrides: string[],
): Promise<{ classification: Classification; llm_source: string }> {
  const fromClaude = await claudeClassify(text, overrides).catch((e) => { console.error(e); return null; });
  if (fromClaude) return { classification: fromClaude, llm_source: 'anthropic' };
  const fromOpenAI = await openaiClassify(text, overrides).catch((e) => { console.error(e); return null; });
  if (fromOpenAI) return { classification: fromOpenAI, llm_source: 'openai' };
  return { classification: regexClassify(text), llm_source: 'regex' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add lib/ai/classify.ts tests/classify.test.ts && git commit -m "feat: capture classifier with Claude>OpenAI>regex fallback chain (TDD)"
```

---

### Task 10: Whisper transcription helper

**Files:**
- Create: `lib/transcribe.ts`

- [ ] **Step 1: Create `lib/transcribe.ts`**

```ts
/** Transcribe a Telegram voice note (OGG/Opus). Telegram serves OGG — the MIME type matters (guide Part 4 bug). */
export async function transcribeOgg(buf: ArrayBuffer): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/ogg' }), 'voice.ogg');
  form.append('model', 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`whisper failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.text ?? '').trim();
}
```

- [ ] **Step 2: Verify build, commit**

```bash
npm run build && git add lib/transcribe.ts && git commit -m "feat: whisper transcription helper"
```

---

### Task 11: Capture pipeline — classify → route → audit

**Files:**
- Create: `lib/capture.ts`

- [ ] **Step 1: Create `lib/capture.ts`**

```ts
import { serviceClient, USER_ID } from '@/lib/supabase';
import { classifyCapture, Classification } from '@/lib/ai/classify';
import { localDateKey } from '@/lib/dates';

/** New tasks land at the top of their tier: base score per tier, above previously ranked items. */
export const TIER_BASE: Record<string, number> = {
  today: 900, this_week: 700, this_month: 500, someday: 300,
};

export interface CaptureResult {
  captureId: string;
  routedTo: string;
  routedId: string | null;
  classification: Classification;
}

export async function processCapture(opts: {
  text: string;
  source: 'telegram' | 'web';
  audioUrl?: string | null;
}): Promise<CaptureResult> {
  const db = serviceClient();

  // Feed the classifier the user's recent corrections so it converges on their judgment.
  const { data: overrideRows, error: ovErr } = await db
    .from('raw_captures')
    .select('classification, override')
    .eq('user_id', USER_ID)
    .not('override', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (ovErr) console.error('override fetch failed', ovErr.message);
  const overrides = (overrideRows ?? []).map((r) =>
    JSON.stringify({ was: r.classification, corrected: r.override }),
  );

  const { classification, llm_source } = await classifyCapture(opts.text, overrides);

  const routedTo =
    classification.kind === 'task' ? 'tasks'
    : classification.kind === 'journal' ? 'journal_entries'
    : 'goals';
  let routedId: string | null = null;

  if (classification.kind === 'task') {
    const { data, error } = await db.from('tasks').insert({
      user_id: USER_ID,
      title: classification.summary,
      description: opts.text.trim() === classification.summary ? null : opts.text,
      urgency: classification.urgency,
      priority_score: TIER_BASE[classification.urgency],
      time_estimate_min: classification.time_estimate_min,
      tags: classification.tags,
    }).select('id').single();
    if (error) throw new Error(`task insert: ${error.message}`);
    routedId = data.id;
  } else if (classification.kind === 'journal') {
    const entryDate = localDateKey();
    const { data: existing, error: exErr } = await db.from('journal_entries')
      .select('id, raw_text').eq('user_id', USER_ID).eq('entry_date', entryDate).maybeSingle();
    if (exErr) throw new Error(`journal lookup: ${exErr.message}`);
    if (existing) {
      const { error } = await db.from('journal_entries')
        .update({ raw_text: `${existing.raw_text}\n\n${opts.text}`.trim() })
        .eq('id', existing.id);
      if (error) throw new Error(`journal update: ${error.message}`);
      routedId = existing.id;
    } else {
      const { data, error } = await db.from('journal_entries')
        .insert({ user_id: USER_ID, entry_date: entryDate, raw_text: opts.text })
        .select('id').single();
      if (error) throw new Error(`journal insert: ${error.message}`);
      routedId = data.id;
    }
  } else {
    const scope = classification.urgency === 'today' || classification.urgency === 'this_week' ? 'week' : 'month';
    const { data, error } = await db.from('goals')
      .insert({ user_id: USER_ID, scope, title: classification.summary })
      .select('id').single();
    if (error) throw new Error(`goal insert: ${error.message}`);
    routedId = data.id;
  }

  const { data: capture, error: capErr } = await db.from('raw_captures').insert({
    user_id: USER_ID,
    source: opts.source,
    raw_text: opts.text,
    audio_url: opts.audioUrl ?? null,
    classification,
    llm_source,
    routed_to: routedTo,
    routed_id: routedId,
  }).select('id').single();
  if (capErr) throw new Error(`capture insert: ${capErr.message}`);

  const { error: auditErr } = await db.from('audit_log').insert({
    user_id: USER_ID, action: 'capture', resource_type: routedTo, resource_id: routedId,
    metadata: { source: opts.source, llm_source },
  });
  if (auditErr) console.error('audit insert failed', auditErr.message);

  return { captureId: capture.id, routedTo, routedId, classification };
}
```

- [ ] **Step 2: Verify build, commit**

```bash
npm run build && git add lib/capture.ts && git commit -m "feat: capture pipeline (classify, route, audit)"
```

---

### Task 12: Telegram webhook route + override buttons + registration

**Files:**
- Create: `app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Manual — create the bot**

In Telegram: @BotFather → `/newbot` → name + `_bot` username → save token as `TELEGRAM_BOT_TOKEN`. Get your numeric ID from @userinfobot → `TELEGRAM_USER_ID`. Generate `TELEGRAM_WEBHOOK_SECRET` with `openssl rand -hex 16`. Add all three to `.env.local` and Vercel.

- [ ] **Step 2: Create `app/api/telegram/webhook/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { processCapture } from '@/lib/capture';
import { transcribeOgg } from '@/lib/transcribe';
import { tgSendMessage, tgAnswerCallback, tgGetFileBuffer } from '@/lib/telegram';
import { serviceClient, USER_ID } from '@/lib/supabase';

export const maxDuration = 60;

const URGENCY_LABELS: Record<string, string> = {
  today: 'Today', this_week: 'This Week', this_month: 'This Month', someday: 'Someday',
};

// callback_data must stay <=64 bytes: "u|<uuid36>|this_month" = 50 bytes. OK.
function urgencyKeyboard(taskId: string) {
  return {
    inline_keyboard: [
      [
        { text: 'Today', callback_data: `u|${taskId}|today` },
        { text: 'This Week', callback_data: `u|${taskId}|this_week` },
      ],
      [
        { text: 'This Month', callback_data: `u|${taskId}|this_month` },
        { text: 'Someday', callback_data: `u|${taskId}|someday` },
      ],
      [{ text: '⭐ Mark Key', callback_data: `k|${taskId}|1` }],
    ],
  };
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json();
  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
  } catch (err) {
    console.error('webhook error', err);
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (chatId) {
      await tgSendMessage(chatId, `⚠️ Capture failed: ${(err as Error).message}`)
        .catch((e) => console.error('error-reply failed', e));
    }
  }
  // Always 200 — otherwise Telegram retry-storms the endpoint.
  return NextResponse.json({ ok: true });
}

async function handleMessage(message: {
  from?: { id: number }; chat: { id: number };
  text?: string; voice?: { file_id: string };
}) {
  if (String(message.from?.id) !== process.env.TELEGRAM_USER_ID) return;
  const chatId = message.chat.id;
  let text = message.text ?? '';
  let audioUrl: string | null = null;

  if (message.voice) {
    const buf = await tgGetFileBuffer(message.voice.file_id);
    text = await transcribeOgg(buf);
    audioUrl = message.voice.file_id;
    if (!text) {
      await tgSendMessage(chatId, "⚠️ Couldn't transcribe that — try again?");
      return;
    }
  }
  if (!text.trim()) return;

  const result = await processCapture({ text, source: 'telegram', audioUrl });
  const c = result.classification;
  const flag = c.low_confidence ? ' (low confidence — AI was down)' : '';

  if (c.kind === 'task' && result.routedId) {
    const est = c.time_estimate_min ? ` · est ${c.time_estimate_min}m` : '';
    await tgSendMessage(
      chatId,
      `✅ Task: ${c.summary}\n${URGENCY_LABELS[c.urgency]}${est}${flag}`,
      urgencyKeyboard(result.routedId),
    );
  } else if (c.kind === 'journal') {
    await tgSendMessage(chatId, `📓 Journaled for today.${flag}`);
  } else {
    await tgSendMessage(chatId, `🎯 Goal added: ${c.summary}${flag}`);
  }
}

async function handleCallback(cb: {
  id: string; from?: { id: number }; data?: string;
}) {
  if (String(cb.from?.id) !== process.env.TELEGRAM_USER_ID) return;
  const [op, taskId, value] = String(cb.data ?? '').split('|');
  if (!op || !taskId) return;
  const db = serviceClient();

  if (op === 'u') {
    const { error } = await db.from('tasks')
      .update({ urgency: value, updated_at: new Date().toISOString() })
      .eq('id', taskId).eq('user_id', USER_ID);
    if (error) throw new Error(error.message);
    await recordOverride(taskId, { urgency: value });
    await tgAnswerCallback(cb.id, `Moved to ${URGENCY_LABELS[value] ?? value}`);
  } else if (op === 'k') {
    const { error } = await db.from('tasks')
      .update({ key: true, updated_at: new Date().toISOString() })
      .eq('id', taskId).eq('user_id', USER_ID);
    if (error) throw new Error(error.message);
    await recordOverride(taskId, { key: true });
    await tgAnswerCallback(cb.id, '⭐ Marked key');
  }
}

/** Store the user's tap-correction on the originating capture — feeds classifier improvement. */
async function recordOverride(taskId: string, override: Record<string, unknown>) {
  const db = serviceClient();
  const { data, error } = await db.from('raw_captures')
    .select('id, override').eq('routed_id', taskId).limit(1).maybeSingle();
  if (error) { console.error('override lookup failed', error.message); return; }
  if (!data) return;
  const { error: upErr } = await db.from('raw_captures')
    .update({ override: { ...((data.override as object) ?? {}), ...override } })
    .eq('id', data.id);
  if (upErr) console.error('override save failed', upErr.message);
}
```

- [ ] **Step 3: Deploy and register the webhook**

```bash
npx vercel --prod
source .env.local
curl -F "url=https://<your-app>.vercel.app/api/telegram/webhook" \
     -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"
```

Expected: `{"ok":true,...,"description":"Webhook was set"}`

- [ ] **Step 4: End-to-end verify**

- Text the bot: "need to film the reel today, about an hour" → reply `✅ Task: … Today · est 60m` with buttons; row appears in Supabase `tasks` + `raw_captures`
- Tap "This Week" → toast "Moved to This Week"; task urgency updated; `raw_captures.override` populated
- Send a voice note → transcribed and routed the same way

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: telegram webhook — voice+text capture with urgency override buttons"
```

---

### Task 13: Web capture — `/api/capture` + floating CaptureBox

**Files:**
- Create: `app/api/capture/route.ts`, `components/dashboard/CaptureBox.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `app/api/capture/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { processCapture } from '@/lib/capture';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { text } = await req.json().catch(() => ({ text: '' }));
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });
  try {
    const result = await processCapture({ text: text.trim(), source: 'web' });
    return NextResponse.json(result);
  } catch (err) {
    console.error('capture failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `components/dashboard/CaptureBox.tsx`**

```tsx
'use client';
import { useState } from 'react';

export default function CaptureBox() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setStatus('busy');
    const res = await fetch('/api/capture', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch((err) => { console.error(err); return null; });
    if (res?.ok) {
      setText('');
      setStatus('done');
      window.dispatchEvent(new Event('capture:done')); // task views listen and refetch
      setTimeout(() => setStatus('idle'), 2000);
    } else {
      console.error('capture failed', res && (await res.text()));
      setStatus('error');
    }
  }

  return (
    <form onSubmit={submit}
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(560px,90vw)] -translate-x-1/2 gap-2 rounded-xl border p-2 backdrop-blur-md"
      style={{ borderColor: 'var(--ink-2)', background: 'color-mix(in oklch, var(--ink-1) 90%, transparent)' }}>
      <input
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Capture anything…"
        className="flex-1 bg-transparent px-2 text-sm outline-none"
      />
      <button type="submit" disabled={status === 'busy'}
        className="rounded px-3 py-1 text-sm font-medium"
        style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
        {status === 'busy' ? '…' : status === 'done' ? '✓' : status === 'error' ? '⚠ retry' : 'Capture'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Add `<CaptureBox />` to `app/layout.tsx` inside `<body>` after `<main>`**

- [ ] **Step 4: Verify**

`npm run dev` → type "prep workshop slides this week" in the box → ✓; row lands in `tasks`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: web capture box sharing the telegram pipeline"
```

---

### Task 14: Tasks CRUD API

**Files:**
- Create: `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `lib/types.ts`

- [ ] **Step 1: Create `lib/types.ts` (shared client/server task shape)**

```ts
export interface Task {
  id: string;
  title: string;
  description: string | null;
  urgency: 'today' | 'this_week' | 'this_month' | 'someday';
  key: boolean;
  priority_score: number;
  rank_pinned: boolean;
  time_estimate_min: number | null;
  actual_time_min: number;
  tags: string[];
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const URGENCIES = ['today', 'this_week', 'this_month', 'someday'] as const;
export const URGENCY_LABELS: Record<Task['urgency'], string> = {
  today: 'Today', this_week: 'This Week', this_month: 'This Month', someday: 'Someday',
};
```

- [ ] **Step 2: Create `app/api/tasks/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { TIER_BASE } from '@/lib/capture';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? 'open';
  const db = serviceClient();
  let q = db.from('tasks').select('*').eq('user_id', USER_ID)
    .order('priority_score', { ascending: false })
    .limit(100000 + (Date.now() % 100000)); // unique limit busts PostgREST edge cache (guide bug #5)
  q = status === 'done' ? q.not('completed_at', 'is', null) : q.is('completed_at', null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const urgency = body.urgency ?? 'this_week';
  const db = serviceClient();
  const { data, error } = await db.from('tasks').insert({
    user_id: USER_ID,
    title: body.title.trim(),
    description: body.description ?? null,
    urgency,
    key: body.key ?? false,
    priority_score: TIER_BASE[urgency] ?? 700,
    time_estimate_min: body.time_estimate_min ?? null,
    tags: body.tags ?? [],
    due_date: body.due_date ?? null,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 3: Create `app/api/tasks/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

const PATCHABLE = new Set([
  'title', 'description', 'urgency', 'key', 'priority_score', 'rank_pinned',
  'time_estimate_min', 'tags', 'due_date', 'completed_at',
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  // A manual priority change is a drag — pin it so the AI re-ranker works around it.
  if ('priority_score' in patch && !('rank_pinned' in patch)) patch.rank_pinned = true;
  patch.updated_at = new Date().toISOString();
  const db = serviceClient();
  const { data, error } = await db.from('tasks').update(patch)
    .eq('id', id).eq('user_id', USER_ID).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  const { error } = await db.from('tasks').delete().eq('id', id).eq('user_id', USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify with curl (dev server running, using API secret)**

```bash
source .env.local
curl -s -H "x-api-secret: $API_SECRET" localhost:3000/api/tasks | head -c 400
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "content-type: application/json" \
  -d '{"title":"test task","urgency":"today","time_estimate_min":30}' localhost:3000/api/tasks
```

Expected: GET returns the captured tasks array; POST returns the created row with `priority_score: 900`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: tasks CRUD API with pin-on-manual-rank"
```

---

### Task 15: AI re-ranker — `mergeRanks` (TDD) + daily cron

**Files:**
- Create: `lib/priority.ts`, `app/api/cron/rerank/route.ts`, `vercel.json`
- Test: `tests/priority.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mergeRanks } from '@/lib/priority';

const t = (id: string, score: number, pinned = false) =>
  ({ id, priority_score: score, rank_pinned: pinned });

describe('mergeRanks', () => {
  it('assigns descending scores per AI order to unpinned tasks', () => {
    const updates = mergeRanks([t('a', 700), t('b', 700), t('c', 700)], ['c', 'a', 'b']);
    expect(updates).toEqual([
      { id: 'c', priority_score: 1000 },
      { id: 'a', priority_score: 990 },
      { id: 'b', priority_score: 980 },
    ]);
  });
  it('never touches pinned tasks', () => {
    const updates = mergeRanks([t('a', 700), t('pin', 850, true)], ['pin', 'a']);
    expect(updates.find((u) => u.id === 'pin')).toBeUndefined();
    expect(updates.find((u) => u.id === 'a')).toBeDefined();
  });
  it('ignores hallucinated ids and appends unpinned tasks the AI forgot', () => {
    const updates = mergeRanks([t('a', 700), t('b', 700)], ['ghost', 'a']);
    expect(updates.map((u) => u.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` — Expected: FAIL — cannot resolve `@/lib/priority`

- [ ] **Step 3: Create `lib/priority.ts`**

```ts
export interface RankableTask {
  id: string;
  priority_score: number;
  rank_pinned: boolean;
}

/**
 * Merge an AI-proposed ordering into scores. Pinned tasks keep their score
 * (a manual drag beats the AI); unpinned tasks get 1000, 990, 980… in AI order.
 * Hallucinated ids are dropped; unpinned tasks missing from the AI order go last.
 */
export function mergeRanks(
  tasks: RankableTask[], aiOrderedIds: string[],
): { id: string; priority_score: number }[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const fromAi = aiOrderedIds.filter((id) => byId.get(id) && !byId.get(id)!.rank_pinned);
  const seen = new Set(fromAi);
  const forgotten = tasks.filter((t) => !t.rank_pinned && !seen.has(t.id)).map((t) => t.id);
  return [...fromAi, ...forgotten].map((id, i) => ({ id, priority_score: 1000 - i * 10 }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` — Expected: all pass

- [ ] **Step 5: Create `app/api/cron/rerank/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { mergeRanks } from '@/lib/priority';
import { localDateKey } from '@/lib/dates';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = serviceClient();
  const { data: tasks, error } = await db.from('tasks')
    .select('id, title, urgency, key, due_date, created_at, priority_score, rank_pinned')
    .eq('user_id', USER_ID).is('completed_at', null)
    .limit(100000 + (Date.now() % 100000));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tasks || tasks.length < 2) return NextResponse.json({ skipped: 'too few tasks' });

  const today = localDateKey();
  const list = tasks.map((t) =>
    `${t.id} | ${t.title} | tier:${t.urgency} | key:${t.key} | due:${t.due_date ?? '-'} | created:${t.created_at.slice(0, 10)}`,
  ).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `Today is ${today}. Rank the user's open tasks: most important/urgent first. Weigh: overdue or due-soon dates, key flag, tier (today > this_week > this_month > someday), and age (old someday items decay, but flag-worthy old tasks rise). Return ONLY a JSON array of task ids in rank order.`,
      messages: [{ role: 'user', content: list }],
    }),
  });
  if (!res.ok) {
    console.error('rerank AI failed', res.status, await res.text());
    return NextResponse.json({ skipped: 'ai failed' }); // 200: cron is best-effort, tomorrow retries
  }
  const json = await res.json();
  const raw: string = json.content?.[0]?.text ?? '[]';
  let ids: string[] = [];
  try {
    ids = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
  } catch {
    console.error('rerank parse failed', raw);
    return NextResponse.json({ skipped: 'parse failed' });
  }

  const updates = mergeRanks(tasks, ids);
  for (const u of updates) {
    const { error: upErr } = await db.from('tasks')
      .update({ priority_score: u.priority_score }).eq('id', u.id).eq('user_id', USER_ID);
    if (upErr) console.error('rerank update failed', u.id, upErr.message);
  }
  return NextResponse.json({ reranked: updates.length });
}
```

- [ ] **Step 6: Create `vercel.json` (6am SGT = 22:00 UTC)**

```json
{
  "crons": [
    { "path": "/api/cron/rerank", "schedule": "0 22 * * *" }
  ]
}
```

- [ ] **Step 7: Verify locally**

```bash
source .env.local
curl -s -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/rerank
```

Expected: `{"reranked":N}` (or `{"skipped":"too few tasks"}`); scores updated in Supabase.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: daily AI re-ranking cron with pinned-rank merge (TDD)"
```

---

### Task 16: Timer sessions — rollup (TDD) + API

**Files:**
- Create: `lib/timers.ts`, `app/api/timers/start/route.ts`, `app/api/timers/stop/route.ts`, `app/api/timers/active/route.ts`
- Test: `tests/timers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { sumSessionMinutes } from '@/lib/timers';

describe('sumSessionMinutes', () => {
  it('sums closed sessions, rounded to minutes', () => {
    expect(sumSessionMinutes([
      { started_at: '2026-07-08T02:00:00Z', ended_at: '2026-07-08T02:25:00Z' },
      { started_at: '2026-07-08T05:00:00Z', ended_at: '2026-07-08T05:35:30Z' },
    ])).toBe(61); // 25 + 35.5 → round 60.5 = 61
  });
  it('counts an open session up to now', () => {
    const now = new Date('2026-07-08T03:00:00Z');
    expect(sumSessionMinutes([{ started_at: '2026-07-08T02:50:00Z', ended_at: null }], now)).toBe(10);
  });
  it('returns 0 for no sessions', () => {
    expect(sumSessionMinutes([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` — Expected: FAIL — cannot resolve `@/lib/timers`

- [ ] **Step 3: Create `lib/timers.ts`** (helpers live here, NOT in route files — Next.js rejects non-HTTP exports from `route.ts`)

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { USER_ID } from '@/lib/supabase';

export interface SessionLike {
  started_at: string;
  ended_at: string | null;
}

export function sumSessionMinutes(sessions: SessionLike[], now: Date = new Date()): number {
  const ms = sessions.reduce((acc, s) => {
    const end = s.ended_at ? new Date(s.ended_at) : now;
    return acc + Math.max(0, end.getTime() - new Date(s.started_at).getTime());
  }, 0);
  return Math.round(ms / 60_000);
}

/** Recompute a task's actual_time_min from its closed sessions. */
export async function rollupTask(db: SupabaseClient, taskId: string): Promise<void> {
  const { data: sessions, error } = await db.from('timer_sessions')
    .select('started_at, ended_at').eq('task_id', taskId).not('ended_at', 'is', null);
  if (error) throw new Error(error.message);
  const { error: upErr } = await db.from('tasks')
    .update({ actual_time_min: sumSessionMinutes(sessions ?? []), updated_at: new Date().toISOString() })
    .eq('id', taskId);
  if (upErr) throw new Error(upErr.message);
}

/** Close any running session(s) and roll their tasks up. Enforces the one-timer-max rule. */
export async function closeOpenSessions(db: SupabaseClient): Promise<void> {
  const { data: open, error } = await db.from('timer_sessions')
    .select('id, task_id').eq('user_id', USER_ID).is('ended_at', null);
  if (error) throw new Error(error.message);
  for (const s of open ?? []) {
    const { error: endErr } = await db.from('timer_sessions')
      .update({ ended_at: new Date().toISOString() }).eq('id', s.id);
    if (endErr) throw new Error(endErr.message);
    await rollupTask(db, s.task_id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` — Expected: all pass

- [ ] **Step 5: Create `app/api/timers/start/route.ts` (one running timer max — starting a new one stops the old)**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { USER_ID } from '@/lib/supabase';
import { closeOpenSessions } from '@/lib/timers';

export async function POST(req: NextRequest) {
  const { task_id } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  const db = serviceClient();
  try {
    await closeOpenSessions(db);
    const { data, error } = await db.from('timer_sessions')
      .insert({ user_id: USER_ID, task_id }).select('*').single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('timer start failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Create `app/api/timers/stop/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { closeOpenSessions } from '@/lib/timers';

export async function POST() {
  const db = serviceClient();
  try {
    await closeOpenSessions(db);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('timer stop failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 7: Create `app/api/timers/active/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function GET() {
  const db = serviceClient();
  const { data, error } = await db.from('timer_sessions')
    .select('id, task_id, started_at, tasks(title, time_estimate_min, actual_time_min)')
    .eq('user_id', USER_ID).is('ended_at', null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null, { headers: { 'cache-control': 'no-store' } });
}
```

- [ ] **Step 8: Verify with curl**

```bash
source .env.local
TASK_ID=$(curl -s -H "x-api-secret: $API_SECRET" localhost:3000/api/tasks | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s -X POST -H "x-api-secret: $API_SECRET" -H "content-type: application/json" -d "{\"task_id\":\"$TASK_ID\"}" localhost:3000/api/timers/start
curl -s -H "x-api-secret: $API_SECRET" localhost:3000/api/timers/active
sleep 65
curl -s -X POST -H "x-api-secret: $API_SECRET" localhost:3000/api/timers/stop
curl -s -H "x-api-secret: $API_SECRET" localhost:3000/api/tasks | python3 -m json.tool | grep -A1 actual_time
```

Expected: active returns the session; after stop, the task's `actual_time_min` is 1.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: timer sessions with DB-backed state and rollup (TDD)"
```

---

### Task 17: TimerStrip — persistent live timer across the app

**Files:**
- Create: `components/dashboard/TimerStrip.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `components/dashboard/TimerStrip.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';

interface ActiveTimer {
  id: string;
  task_id: string;
  started_at: string;
  tasks: { title: string; time_estimate_min: number | null; actual_time_min: number };
}

export default function TimerStrip() {
  const [active, setActive] = useState<ActiveTimer | null>(null);
  const [, forceTick] = useState(0);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/timers/active').catch((e) => { console.error(e); return null; });
    if (res?.ok) setActive(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 15_000);
    const tick = setInterval(() => forceTick((n) => n + 1), 1_000);
    window.addEventListener('timer:changed', refresh);
    return () => { clearInterval(poll); clearInterval(tick); window.removeEventListener('timer:changed', refresh); };
  }, [refresh]);

  if (!active) return null;

  const elapsedMin = (Date.now() - new Date(active.started_at).getTime()) / 60_000;
  const totalMin = active.tasks.actual_time_min + elapsedMin;
  const est = active.tasks.time_estimate_min;
  const over = est != null && totalMin > est;
  const mm = Math.floor(elapsedMin);
  const ss = Math.floor((elapsedMin - mm) * 60).toString().padStart(2, '0');

  async function stop() {
    const res = await fetch('/api/timers/stop', { method: 'POST' }).catch((e) => { console.error(e); return null; });
    if (res?.ok) {
      setActive(null);
      window.dispatchEvent(new Event('timer:changed'));
    }
  }

  return (
    <div className="flex items-center justify-between border-b px-6 py-2"
      style={{ borderColor: 'var(--ink-2)', background: 'color-mix(in oklch, var(--accent) 8%, var(--ink-0))' }}>
      <span className="text-sm">
        ▶ <strong>{active.tasks.title}</strong>
        <span className="mono ml-3" style={{ color: over ? 'var(--danger)' : 'var(--ok)' }}>
          {mm}:{ss}
        </span>
        {est != null && (
          <span className="mono ml-2 text-xs" style={{ color: 'var(--ink-3)' }}>
            {Math.round(totalMin)}m / est {est}m
          </span>
        )}
      </span>
      <button onClick={stop} className="mono rounded border px-2 py-0.5 text-xs"
        style={{ borderColor: 'var(--ink-2)' }}>
        ■ STOP
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add `<TimerStrip />` to `app/layout.tsx` directly below `<TopRail />`**

- [ ] **Step 3: Verify**

Start a timer via curl (Task 16 step 8) → strip appears on every page with a ticking clock; STOP ends it and the strip disappears.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: persistent live timer strip"
```

---

### Task 18: Tasks page — List view + edit drawer

**Files:**
- Create: `app/tasks/page.tsx`, `components/tasks/TaskBoard.tsx`, `components/tasks/TaskRow.tsx`, `components/tasks/TaskDrawer.tsx`, `lib/clientTasks.ts`

- [ ] **Step 1: Create `lib/clientTasks.ts` (client-side fetch helpers, one place for error logging)**

```ts
import type { Task } from '@/lib/types';

export async function fetchTasks(status: 'open' | 'done' = 'open'): Promise<Task[]> {
  const res = await fetch(`/api/tasks?status=${status}`);
  if (!res.ok) { console.error('fetchTasks failed', res.status, await res.text()); return []; }
  return res.json();
}

export async function patchTask(id: string, patch: Partial<Task>): Promise<Task | null> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchTask failed', res.status, await res.text()); return null; }
  return res.json();
}

export async function deleteTask(id: string): Promise<boolean> {
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) console.error('deleteTask failed', res.status, await res.text());
  return res.ok;
}

export async function startTimer(taskId: string): Promise<boolean> {
  const res = await fetch('/api/timers/start', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) console.error('startTimer failed', res.status, await res.text());
  else window.dispatchEvent(new Event('timer:changed'));
  return res.ok;
}
```

- [ ] **Step 2: Create `components/tasks/TaskRow.tsx`**

```tsx
'use client';
import type { Task } from '@/lib/types';
import { URGENCY_LABELS } from '@/lib/types';

export default function TaskRow({ task, onComplete, onOpen, onStartTimer }: {
  task: Task;
  onComplete: (t: Task) => void;
  onOpen: (t: Task) => void;
  onStartTimer: (t: Task) => void;
}) {
  const est = task.time_estimate_min;
  const actual = task.actual_time_min;
  const overColor = est != null && actual > est ? 'var(--danger)' : 'var(--ok)';
  return (
    <div className="flex items-center gap-3 border-b px-2 py-2 text-sm" style={{ borderColor: 'var(--ink-2)' }}>
      <input type="checkbox" checked={false} onChange={() => onComplete(task)} aria-label="complete" />
      <button className="flex-1 text-left" onClick={() => onOpen(task)}>
        {task.key && <span style={{ color: 'var(--warn)' }}>⭐ </span>}
        {task.title}
        {task.tags.length > 0 && (
          <span className="mono ml-2 text-xs" style={{ color: 'var(--ink-3)' }}>{task.tags.join(' · ')}</span>
        )}
      </button>
      <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>{URGENCY_LABELS[task.urgency]}</span>
      <span className="mono text-xs">
        {est != null ? `est ${est}m` : 'est —'}
        <span style={{ color: overColor }}> → {actual}m</span>
      </span>
      <button onClick={() => onStartTimer(task)} title="Start timer" className="mono rounded border px-1.5 text-xs"
        style={{ borderColor: 'var(--ink-2)' }}>▶</button>
      {task.due_date && <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>{task.due_date}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/tasks/TaskDrawer.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';
import { URGENCIES, URGENCY_LABELS } from '@/lib/types';

export default function TaskDrawer({ task, onSave, onDelete, onClose }: {
  task: Task;
  onSave: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    urgency: task.urgency,
    key: task.key,
    time_estimate_min: task.time_estimate_min?.toString() ?? '',
    due_date: task.due_date ?? '',
    tags: task.tags.join(', '),
  });
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const inputStyle = { borderColor: 'var(--ink-2)', background: 'transparent' };

  function save() {
    onSave({
      title: form.title.trim(),
      description: form.description.trim() || null,
      urgency: form.urgency,
      key: form.key,
      time_estimate_min: form.time_estimate_min ? Number(form.time_estimate_min) : null,
      due_date: form.due_date || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[min(420px,95vw)] overflow-y-auto border-l p-5"
      style={{ borderColor: 'var(--ink-2)', background: 'var(--ink-1)' }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="mono text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--ink-3)' }}>Edit task</h3>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="flex flex-col gap-3 text-sm">
        <input className="rounded border p-2" style={inputStyle} value={form.title}
          onChange={(e) => set('title', e.target.value)} placeholder="Title" />
        <textarea className="min-h-24 rounded border p-2" style={inputStyle} value={form.description}
          onChange={(e) => set('description', e.target.value)} placeholder="Description" />
        <select className="rounded border p-2" style={inputStyle} value={form.urgency}
          onChange={(e) => set('urgency', e.target.value)}>
          {URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.key} onChange={(e) => set('key', e.target.checked)} /> ⭐ Key task
        </label>
        <input className="rounded border p-2" style={inputStyle} value={form.time_estimate_min}
          onChange={(e) => set('time_estimate_min', e.target.value)} placeholder="Projected minutes" inputMode="numeric" />
        <input type="date" className="rounded border p-2" style={inputStyle} value={form.due_date}
          onChange={(e) => set('due_date', e.target.value)} />
        <input className="rounded border p-2" style={inputStyle} value={form.tags}
          onChange={(e) => set('tags', e.target.value)} placeholder="tags, comma, separated" />
        <div className="mt-2 flex justify-between">
          <button onClick={onDelete} className="rounded border px-3 py-1.5"
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>Delete</button>
          <button onClick={save} className="rounded px-4 py-1.5 font-medium"
            style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/tasks/TaskBoard.tsx` (state owner; List view first — Kanban/Smart tabs stubbed until Tasks 19–20)**

```tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import { fetchTasks, patchTask, deleteTask, startTimer } from '@/lib/clientTasks';
import TaskRow from './TaskRow';
import TaskDrawer from './TaskDrawer';
import Panel from '@/components/ui/Panel';

const VIEWS = ['list', 'kanban', 'smart'] as const;
export type View = (typeof VIEWS)[number];

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Task | null>(null);
  const dirtyRef = useRef(false); // guard: a mount-time GET must never clobber a fresh edit (guide bug #4)

  const load = useCallback(async () => {
    const data = await fetchTasks('open');
    if (!dirtyRef.current) setTasks(data);
    else setTasks((cur) => data.map((d) => cur.find((c) => c.id === d.id && c.updated_at > d.updated_at) ?? d));
  }, []);

  useEffect(() => {
    setView((localStorage.getItem('pos-task-view') as View) || 'list');
    load();
    window.addEventListener('capture:done', load);
    window.addEventListener('timer:changed', load);
    return () => { window.removeEventListener('capture:done', load); window.removeEventListener('timer:changed', load); };
  }, [load]);

  function switchView(v: View) {
    setView(v);
    localStorage.setItem('pos-task-view', v);
  }

  async function applyPatch(id: string, patch: Partial<Task>) {
    dirtyRef.current = true;
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } as Task : t)));
    const saved = await patchTask(id, patch);
    if (saved) setTasks((cur) => cur.map((t) => (t.id === id ? saved : t)));
    else load(); // server rejected — resync rather than lie
  }

  async function complete(task: Task) {
    dirtyRef.current = true;
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    const saved = await patchTask(task.id, { completed_at: new Date().toISOString() });
    if (!saved) load();
  }

  async function remove(task: Task) {
    dirtyRef.current = true;
    setSelected(null);
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    if (!(await deleteTask(task.id))) load();
  }

  const sorted = [...tasks].sort((a, b) => b.priority_score - a.priority_score);

  return (
    <Panel
      title="Tasks"
      right={
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <button key={v} onClick={() => switchView(v)}
              className="mono rounded px-2 py-0.5 text-xs uppercase"
              style={{
                background: view === v ? 'var(--ink-2)' : 'transparent',
                color: view === v ? 'var(--ink-4)' : 'var(--ink-3)',
              }}>
              {v}
            </button>
          ))}
        </div>
      }
    >
      {view === 'list' && (
        <div>
          {sorted.length === 0 && <p style={{ color: 'var(--ink-3)' }}>No open tasks. Capture something.</p>}
          {sorted.map((t) => (
            <TaskRow key={t.id} task={t} onComplete={complete} onOpen={setSelected}
              onStartTimer={(task) => startTimer(task.id)} />
          ))}
        </div>
      )}
      {view === 'kanban' && <p style={{ color: 'var(--ink-3)' }}>Kanban lands in the next task.</p>}
      {view === 'smart' && <p style={{ color: 'var(--ink-3)' }}>Smart search lands soon.</p>}

      {selected && (
        <TaskDrawer
          task={selected}
          onClose={() => setSelected(null)}
          onDelete={() => remove(selected)}
          onSave={(patch) => { applyPatch(selected.id, patch); setSelected(null); }}
        />
      )}
    </Panel>
  );
}
```

- [ ] **Step 5: Create `app/tasks/page.tsx`**

```tsx
import TaskBoard from '@/components/tasks/TaskBoard';

export default function TasksPage() {
  return <TaskBoard />;
}
```

- [ ] **Step 6: Verify**

`npm run dev` → /tasks shows captured tasks ordered by score; checkbox completes; row click opens drawer; edits persist after refresh; ▶ starts the timer (strip appears).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: tasks page with priority list view, edit drawer, timer chips"
```

---

### Task 19: Kanban view — 4 urgency columns with drag

**Files:**
- Create: `components/tasks/KanbanView.tsx`
- Modify: `components/tasks/TaskBoard.tsx`

- [ ] **Step 1: Create `components/tasks/KanbanView.tsx` (native HTML5 drag — no deps; upgradeable to dnd-kit later)**

```tsx
'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';
import { URGENCIES, URGENCY_LABELS } from '@/lib/types';

export default function KanbanView({ tasks, onDrop, onOpen, onStartTimer }: {
  tasks: Task[];
  /** target urgency + new priority_score (drag = manual rank = pin, handled by PATCH) */
  onDrop: (taskId: string, urgency: Task['urgency'], priorityScore: number) => void;
  onOpen: (t: Task) => void;
  onStartTimer: (t: Task) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  const byTier = (u: Task['urgency']) =>
    tasks.filter((t) => t.urgency === u).sort((a, b) => b.priority_score - a.priority_score);

  /** Score that lands the dragged card at `index` within the tier's current order. */
  function scoreAt(tier: Task[], index: number): number {
    const above = tier[index - 1]?.priority_score;
    const below = tier[index]?.priority_score;
    if (above == null && below == null) return 700;
    if (above == null) return below! + 10;
    if (below == null) return above - 10;
    return (above + below) / 2;
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {URGENCIES.map((u) => {
        const tier = byTier(u).filter((t) => t.id !== dragId);
        return (
          <div key={u}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) onDrop(dragId, u, scoreAt(tier, tier.length));
              setDragId(null);
            }}
            className="min-h-40 rounded-lg border p-2"
            style={{ borderColor: 'var(--ink-2)' }}>
            <h3 className="mono mb-2 text-xs uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
              {URGENCY_LABELS[u]} · {byTier(u).length}
            </h3>
            {tier.map((t, i) => (
              <div key={t.id} draggable
                onDragStart={() => setDragId(t.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  if (dragId && dragId !== t.id) onDrop(dragId, u, scoreAt(tier, i));
                  setDragId(null);
                }}
                className="mb-2 cursor-grab rounded-lg border p-2 text-sm"
                style={{ borderColor: 'var(--ink-2)', background: 'var(--ink-1)' }}>
                <button className="block w-full text-left" onClick={() => onOpen(t)}>
                  {t.key && <span style={{ color: 'var(--warn)' }}>⭐ </span>}{t.title}
                </button>
                <div className="mono mt-1 flex items-center justify-between text-xs" style={{ color: 'var(--ink-3)' }}>
                  <span>
                    {t.time_estimate_min != null ? `est ${t.time_estimate_min}m` : 'est —'}
                    <span style={{ color: t.time_estimate_min != null && t.actual_time_min > t.time_estimate_min ? 'var(--danger)' : 'var(--ok)' }}>
                      {' '}→ {t.actual_time_min}m
                    </span>
                  </span>
                  <button onClick={() => onStartTimer(t)} title="Start timer">▶</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `TaskBoard.tsx`** — replace the kanban stub:

```tsx
{view === 'kanban' && (
  <KanbanView
    tasks={tasks}
    onOpen={setSelected}
    onStartTimer={(t) => startTimer(t.id)}
    onDrop={(taskId, urgency, priorityScore) =>
      applyPatch(taskId, { urgency, priority_score: priorityScore })}
  />
)}
```

Add `import KanbanView from './KanbanView';`. (The PATCH route auto-sets `rank_pinned: true` on manual `priority_score` changes — Task 14.)

- [ ] **Step 3: Verify**

Kanban tab: 4 columns; drag a card across columns → urgency changes, persists on refresh; drop onto a specific card → lands at that position; DB shows `rank_pinned = true`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: kanban view with drag re-tier/reorder (pins rank)"
```

---

### Task 20: Smart view — natural-language task search

**Files:**
- Create: `app/api/tasks/smart/route.ts`, `components/tasks/SmartView.tsx`
- Modify: `components/tasks/TaskBoard.tsx`

- [ ] **Step 1: Create `app/api/tasks/smart/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({ query: '' }));
  if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 });

  const db = serviceClient();
  const { data: tasks, error } = await db.from('tasks')
    .select('id, title, urgency, key, tags, due_date, time_estimate_min')
    .eq('user_id', USER_ID).is('completed_at', null)
    .limit(100000 + (Date.now() % 100000));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tasks?.length) return NextResponse.json({ ids: [], note: 'No open tasks.' });

  const list = tasks.map((t) =>
    `${t.id} | ${t.title} | ${t.urgency} | key:${t.key} | est:${t.time_estimate_min ?? '-'}m | tags:${t.tags.join(',')} | due:${t.due_date ?? '-'}`,
  ).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: 'Given the user\'s open tasks and their question, return ONLY JSON: {"ids": string[] (matching task ids, best order first), "note": string (one helpful sentence)}.',
      messages: [{ role: 'user', content: `Tasks:\n${list}\n\nQuestion: ${query}` }],
    }),
  });
  if (!res.ok) {
    console.error('smart search failed', res.status, await res.text());
    return NextResponse.json({ error: 'AI unavailable' }, { status: 502 });
  }
  const json = await res.json();
  const raw: string = json.content?.[0]?.text ?? '{}';
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const valid = new Set(tasks.map((t) => t.id));
    return NextResponse.json({
      ids: (parsed.ids ?? []).filter((id: string) => valid.has(id)),
      note: typeof parsed.note === 'string' ? parsed.note : '',
    });
  } catch {
    console.error('smart parse failed', raw);
    return NextResponse.json({ error: 'AI returned garbage' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create `components/tasks/SmartView.tsx`**

```tsx
'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';
import TaskRow from './TaskRow';

export default function SmartView({ tasks, onComplete, onOpen, onStartTimer }: {
  tasks: Task[];
  onComplete: (t: Task) => void;
  onOpen: (t: Task) => void;
  onStartTimer: (t: Task) => void;
}) {
  const [query, setQuery] = useState('');
  const [ids, setIds] = useState<string[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    const res = await fetch('/api/tasks/smart', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
    }).catch((err) => { console.error(err); return null; });
    setBusy(false);
    if (!res?.ok) { setNote('Smart search unavailable — try again.'); return; }
    const json = await res.json();
    setIds(json.ids);
    setNote(json.note);
  }

  const shown = ids === null ? [] : ids.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t);

  return (
    <div>
      <form onSubmit={ask} className="mb-3 flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="what should I knock out in the next hour?"
          className="flex-1 rounded border bg-transparent p-2 text-sm"
          style={{ borderColor: 'var(--ink-2)' }} />
        <button type="submit" disabled={busy} className="rounded px-3 text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
          {busy ? '…' : 'Ask'}
        </button>
      </form>
      {note && <p className="mb-2 text-sm" style={{ color: 'var(--ink-3)' }}>{note}</p>}
      {shown.map((t) => (
        <TaskRow key={t.id} task={t} onComplete={onComplete} onOpen={onOpen} onStartTimer={onStartTimer} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire into `TaskBoard.tsx`** — replace the smart stub:

```tsx
{view === 'smart' && (
  <SmartView tasks={tasks} onComplete={complete} onOpen={setSelected}
    onStartTimer={(t) => startTimer(t.id)} />
)}
```

- [ ] **Step 4: Verify**

Smart tab: ask "quick wins under 30 minutes" → sensible subset returned with a note.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: smart view — NL task search via Claude"
```

---

### Task 21: Home — Session card ("today I will…" + top 3)

**Files:**
- Create: `components/dashboard/SessionCard.tsx`, `app/api/focus/route.ts`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create `app/api/focus/route.ts` (persists "today I will…" on today's journal row)**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';

export async function GET() {
  const db = serviceClient();
  const { data, error } = await db.from('journal_entries')
    .select('focus').eq('user_id', USER_ID).eq('entry_date', localDateKey()).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ focus: data?.focus ?? '' }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const { focus } = await req.json().catch(() => ({ focus: '' }));
  const db = serviceClient();
  const { error } = await db.from('journal_entries').upsert(
    { user_id: USER_ID, entry_date: localDateKey(), focus: focus ?? '' },
    { onConflict: 'user_id,entry_date' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create `components/dashboard/SessionCard.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import { fetchTasks, startTimer } from '@/lib/clientTasks';
import Panel from '@/components/ui/Panel';

export default function SessionCard() {
  const [top, setTop] = useState<Task[]>([]);
  const [focus, setFocus] = useState('');
  const focusDirty = useRef(false);

  const load = useCallback(async () => {
    const tasks = await fetchTasks('open');
    setTop(
      tasks
        .filter((t) => t.key || t.urgency === 'today')
        .sort((a, b) => Number(b.key) - Number(a.key) || b.priority_score - a.priority_score)
        .slice(0, 3),
    );
    const res = await fetch('/api/focus').catch((e) => { console.error(e); return null; });
    if (res?.ok && !focusDirty.current) setFocus((await res.json()).focus);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('capture:done', load);
    return () => window.removeEventListener('capture:done', load);
  }, [load]);

  async function saveFocus() {
    const res = await fetch('/api/focus', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ focus }),
    }).catch((e) => { console.error(e); return null; });
    if (!res?.ok) console.error('focus save failed', res && (await res.text()));
  }

  return (
    <Panel title="01 // Session">
      <input
        value={focus}
        onChange={(e) => { focusDirty.current = true; setFocus(e.target.value); }}
        onBlur={saveFocus}
        placeholder="Today I will…"
        className="mb-4 w-full border-b bg-transparent pb-2 text-lg outline-none"
        style={{ borderColor: 'var(--ink-2)' }}
      />
      {top.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No key tasks yet — star some, or capture with “today”.</p>}
      {top.map((t) => (
        <div key={t.id} className="flex items-center justify-between py-1.5 text-sm">
          <span>{t.key ? '⭐ ' : ''}{t.title}</span>
          <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>
            {t.time_estimate_min != null ? `est ${t.time_estimate_min}m` : ''}
            <button className="ml-2" onClick={() => startTimer(t.id)} title="Start timer">▶</button>
          </span>
        </div>
      ))}
    </Panel>
  );
}
```

- [ ] **Step 3: Update `app/page.tsx`**

```tsx
import SessionCard from '@/components/dashboard/SessionCard';
import Panel from '@/components/ui/Panel';

export default function Home() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SessionCard />
      <Panel title="02 // Habits"><p style={{ color: 'var(--ink-3)' }}>Habit tracker lands in Phase 2.</p></Panel>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Home shows the focus input (persists across refresh) + top 3 (key/today tasks, key first); ▶ starts a timer.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: session card — daily focus + AI-ranked top 3"
```

---

### Task 22: Phase 1 ship — deploy + end-to-end verification

**Files:** none (ops)

- [ ] **Step 1: Run the full test suite and build**

Run: `npm test && npm run build` — Expected: all tests pass, clean build

- [ ] **Step 2: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 3: Production round-trip checklist**

- [ ] Voice note the bot → task appears on /tasks within ~5s with a sensible estimate
- [ ] Tap an urgency button → tier changes; `raw_captures.override` recorded
- [ ] Web capture box → task appears without refresh (capture:done event)
- [ ] Drag a card in Kanban → position survives refresh; `rank_pinned` true in DB
- [ ] Start timer on phone browser → strip visible on laptop within 15s; stop → `actual_time_min` correct
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/rerank` → `{"reranked":N}`; pinned task's score unchanged
- [ ] Smart view answers a NL query on production
- [ ] Login required in a fresh incognito window; API routes 401 without cookie/secret

- [ ] **Step 4: Tag**

```bash
git tag phase-1 && git push --tags
```

---

## Post-P1 notes for the next planning session

- **Phase 2 (habits + nudges):** Vercel **Hobby crons are daily-only** — the 15-minute nudge cron needs either Vercel Pro or a free external pinger (cron-job.org) hitting `/api/cron/nudges` with the CRON_SECRET header. Decide then.
- Estimate calibration (P2) reads `timer_sessions` + `tasks.time_estimate_min` — the data is already accumulating from P1 day one.
