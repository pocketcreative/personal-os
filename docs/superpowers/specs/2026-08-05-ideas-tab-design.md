# Ideas tab — design

## Purpose

Add a fourth tab, "Ideas", for jotting down free-form creative/content ideas (e.g. ad angles, post topics) so they don't get lost. Simple capture list, not a structured backlog.

## Data model

New table `ideas`, migration `0007_ideas.sql`:

```sql
create table ideas (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  text text not null,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ideas enable row level security;
create index ideas_user_idx on ideas (user_id, created_at);
```

No RLS policies (deny-all), matching every other table — server routes use the service-role key and bypass RLS.

`lib/types.ts` gets:

```ts
export interface Idea {
  id: string;
  text: string;
  used: boolean;
  created_at: string;
  updated_at: string;
}
```

## API

- `app/api/ideas/route.ts`
  - `GET` — list all ideas for `USER_ID`, ordered `created_at desc`.
  - `POST` — body `{ text: string }`; 400 if `text` isn't a non-empty string after trim; inserts with `used: false`.
- `app/api/ideas/[id]/route.ts`
  - `PATCH` — body `Partial<Idea>` (used for editing `text` and toggling `used`).
  - `DELETE` — deletes by id.

Mirrors `app/api/tasks/route.ts` and `app/api/tasks/[id]/route.ts` in structure, error handling, and use of `serviceClient()` / `USER_ID`.

## Client

`lib/clientIdeas.ts`:

```ts
fetchIdeas(): Promise<Idea[]>
addIdea(text: string): Promise<Idea | null>
patchIdea(id: string, patch: Partial<Idea>): Promise<Idea | null>
deleteIdea(id: string): Promise<boolean>
```

Same fetch/error-log pattern as `lib/clientTasks.ts`.

## UI

- `app/ideas/page.tsx` — thin wrapper rendering `<IdeasBoard />`, matching `app/reflections/page.tsx`.
- `components/ideas/IdeasBoard.tsx`:
  - Text input + "Add" button at the top (Enter submits). Optimistically prepends the new idea, rolls back on failure.
  - List below, newest first. Each row: idea text, a checkbox toggling `used` (checked rows show struck-through/dimmed text), and a delete (×) button with no confirm dialog (low-stakes, single-line content).
  - Click the text to edit inline (becomes a text input, blur/Enter saves via `patchIdea`, Escape cancels).
  - No categories, tags, drag-reorder, or status enum — deliberately flat.
  - Empty state: simple placeholder text ("No ideas yet — add one above.").

## Nav

`components/dashboard/TopRail.tsx`: add `{ href: '/ideas', label: 'Ideas' }` to the `TABS` array, after Reflections.

## Seeding

After the feature is built and verified, seed these four ideas via the running app (POST through the UI, not hardcoded into the migration):
1. How to use AI for real estate agents
2. Reasons why agents don't get leads
3. How I'll close $100k coms in 3 months if I'm an agent
4. How to fire your $3k/month vendor

## Testing

Add a Vitest test for any pure logic if one emerges (unlikely — this feature is thin CRUD with no sort/classify logic like `taskSort.ts`). No dedicated test file planned; existing test suite should stay green.

## Out of scope

- Categories, tags, priority, due dates
- Reordering / drag-and-drop
- AI classification or auto-capture routing (unlike `raw_captures`)
