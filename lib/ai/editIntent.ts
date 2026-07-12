import { requireEnv } from '@/lib/auth';

export type EditStatus = 'not_started' | 'in_progress' | 'completed' | 'archived';
export type EditCategory = 'personal' | 'business';

export interface EditChanges {
  status?: EditStatus;
  key?: boolean;
  category?: EditCategory;
  description?: { action: 'set' | 'append'; text: string };
}

export interface EditIntent {
  match: 'single' | 'ambiguous' | 'none';
  taskId: string | null;
  candidateTitles?: string[];
  changes?: EditChanges;
  isEditIntent: boolean;
}

const STATUSES: EditStatus[] = ['not_started', 'in_progress', 'completed', 'archived'];
const CATEGORIES: EditCategory[] = ['personal', 'business'];
const MATCHES = ['single', 'ambiguous', 'none'] as const;

const NOT_AN_EDIT: EditIntent = { match: 'none', taskId: null, isEditIntent: false };

function systemPrompt(openTasks: { id: string; title: string }[]): string {
  const taskList = openTasks.map((t) => `- ${t.id}: ${t.title}`).join('\n');
  return `You decide whether a message from the user is an instruction to EDIT one of their existing open tasks, or something else entirely (a brand new task/journal/goal to capture, unrelated chat, etc).

Here is the user's current list of open (not started / in progress) tasks, as "id: title":
${taskList}

Return ONLY a JSON object matching this shape:
{"isEditIntent": boolean, "match": "single"|"ambiguous"|"none", "taskId": string|null, "candidateTitles": string[] (only for "ambiguous"), "changes": {"status": "not_started"|"in_progress"|"completed"|"archived", "key": boolean, "category": "personal"|"business", "description": {"action": "set"|"append", "text": string}} (any subset of these fields, only the ones the message actually asks to change)}

Rules:
- isEditIntent is true ONLY if the message is clearly referring to and asking to modify an EXISTING task from the list above (e.g. "mark X as done", "make X today's priority", "archive X", "add description to X: ...", "change X to personal/business"). Phrases like "mark as done", "archive", "make it today's priority", "change category to" are strong edit signals.
- If the message reads like a brand new task/journal/goal description (not referencing an existing item), isEditIntent is false, match is "none", taskId is null, and changes is omitted. Do NOT try to force-match a new-sounding message onto an existing task.
- If isEditIntent is true and exactly ONE task in the list is a clear, confident match for what the message refers to, set match:"single" and taskId to that task's id.
- If isEditIntent is true but the message could plausibly refer to TWO OR MORE tasks in the list (e.g. an ambiguous partial title match), set match:"ambiguous", taskId:null, and candidateTitles to the titles of the plausible candidates. Do NOT guess — when in doubt between multiple tasks, always choose "ambiguous" over "single".
- If isEditIntent is true but NO task in the list is a reasonable match, set match:"none", taskId:null, and omit changes.
- Only include fields in "changes" that the message actually asks to change. "mark as done"/"complete"/"finished" -> status:"completed". "archive"/"remove from list" -> status:"archived". "today's priority"/"make it today"/"prioritize today" -> key:true. "not a priority today"/"unmark today" -> key:false. "change to personal"/"change to business" -> category. "add description"/"append to description" -> description with action "append" unless the message clearly says to replace/overwrite, in which case action "set".
- Respond with ONLY the JSON object, no prose.`;
}

function validateChanges(obj: unknown): EditChanges | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const o = obj as Record<string, unknown>;
  const changes: EditChanges = {};
  if (typeof o.status === 'string' && STATUSES.includes(o.status as EditStatus)) {
    changes.status = o.status as EditStatus;
  }
  if (typeof o.key === 'boolean') changes.key = o.key;
  if (typeof o.category === 'string' && CATEGORIES.includes(o.category as EditCategory)) {
    changes.category = o.category as EditCategory;
  }
  if (typeof o.description === 'object' && o.description !== null) {
    const d = o.description as Record<string, unknown>;
    if ((d.action === 'set' || d.action === 'append') && typeof d.text === 'string' && d.text.trim()) {
      changes.description = { action: d.action, text: d.text.trim() };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

export function parseEditIntent(raw: string, openTasks: { id: string; title: string }[]): EditIntent | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

    if (typeof obj.isEditIntent !== 'boolean') return null;
    if (!obj.isEditIntent) return NOT_AN_EDIT;

    if (!MATCHES.includes(obj.match as (typeof MATCHES)[number])) return null;
    const match = obj.match as (typeof MATCHES)[number];

    if (match === 'single') {
      const taskId = typeof obj.taskId === 'string' ? obj.taskId : null;
      // The model must point at a real id from the list we gave it — an
      // unknown id here means it hallucinated, which we treat as a parse
      // failure so the caller falls back safely rather than editing garbage.
      if (!taskId || !openTasks.some((t) => t.id === taskId)) return null;
      const changes = validateChanges(obj.changes);
      if (!changes) return null;
      return { match: 'single', taskId, changes, isEditIntent: true };
    }

    if (match === 'ambiguous') {
      const candidateTitles = Array.isArray(obj.candidateTitles)
        ? obj.candidateTitles.filter((t: unknown): t is string => typeof t === 'string')
        : [];
      if (candidateTitles.length < 2) return null;
      return { match: 'ambiguous', taskId: null, candidateTitles, isEditIntent: true };
    }

    // match === 'none'
    return { match: 'none', taskId: null, isEditIntent: true };
  } catch {
    return null;
  }
}

const PROVIDER_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function claudeDetectEdit(
  text: string, openTasks: { id: string; title: string }[],
): Promise<EditIntent | null> {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': requireEnv('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemPrompt(openTasks),
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!res.ok) {
    console.error('anthropic editIntent failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return parseEditIntent(json.content?.[0]?.text ?? '', openTasks);
}

async function openaiDetectEdit(
  text: string, openTasks: { id: string; title: string }[],
): Promise<EditIntent | null> {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CLASSIFIER_MODEL ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(openTasks) },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) {
    console.error('openai editIntent failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return parseEditIntent(json.choices?.[0]?.message?.content ?? '', openTasks);
}

/**
 * Decide whether `text` is an instruction to edit one of `openTasks`. If
 * `openTasks` is empty there is nothing to edit against, so we skip the LLM
 * call entirely and short-circuit to "not an edit" (this doubles as the safe
 * fallback if both providers fail below — an ambiguous/malformed result from
 * the LLM must NEVER be treated as a confident edit, only ever as "not an
 * edit" so the caller falls through to the normal capture flow instead of
 * silently applying or silently creating something wrong).
 */
export async function detectEditIntent(
  text: string, openTasks: { id: string; title: string }[],
): Promise<EditIntent> {
  if (openTasks.length === 0) return NOT_AN_EDIT;

  const fromClaude = await claudeDetectEdit(text, openTasks).catch((e) => { console.error(e); return null; });
  if (fromClaude) return fromClaude;
  const fromOpenAI = await openaiDetectEdit(text, openTasks).catch((e) => { console.error(e); return null; });
  if (fromOpenAI) return fromOpenAI;
  // No regex fallback here (unlike classifyCapture) — guessing at edit intent
  // without an LLM risks silently misfiring on someone's real task list, which
  // is explicitly the thing this feature must never do. Safer to fall through
  // to the normal capture flow than to hand back a low-confidence guess.
  return NOT_AN_EDIT;
}
