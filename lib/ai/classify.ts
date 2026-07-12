import { requireEnv } from '@/lib/auth';

export type CaptureKind = 'task' | 'journal' | 'goal';
export type Priority = 'today' | 'dash';
export type Category = 'personal' | 'business';

export interface Classification {
  kind: CaptureKind;
  priority: Priority;
  category: Category;
  tags: string[];
  summary: string;
  description_points: string[];
  time_estimate_min: number | null;
  low_confidence: boolean;
}

const KINDS: CaptureKind[] = ['task', 'journal', 'goal'];
const PRIORITIES: Priority[] = ['today', 'dash'];
const CATEGORIES: Category[] = ['personal', 'business'];

const SYSTEM_PROMPT = `You classify one or more captured notes from the user's phone into strict JSON.
Return ONLY a JSON object:
{"items":[{"kind":"task"|"journal"|"goal","priority":"today"|"dash","category":"personal"|"business","tags":string[] (1-3 lowercase words),"summary":string (imperative, <=80 chars),"description_points":string[] (0-6 short bullet points in English summarizing key details/sub-steps beyond the title/summary; use an empty array if the title alone already fully captures the task — don't pad trivial one-line tasks with redundant bullets),"time_estimate_min":number|null}, ...]}
- Most notes describe exactly ONE thing — return a single-element "items" array in that case.
- If the note clearly describes MULTIPLE distinct, separately-actionable items (e.g. "I need to do X and also Y", or a list of things), return one object per item in "items" — each with its own accurate fields for just that item, not a merged/averaged one.
- "task" = a single actionable item. "journal" = reflection/diary about the day. "goal" = an outcome for the week/month, not one action.
- priority: "today" only if the note implies urgency/today, otherwise "dash".
- category: "business" for work/client/professional items, "personal" for everything else.
- time_estimate_min: honest working-time estimate for tasks (the user has ADHD and underestimates); null for journal/goal.
- If the source note is written in a language other than English, "summary" AND "description_points" must both be produced in English — translate, don't transliterate. This applies even if the rest of the note is left unprocessed.
- description_points should be genuinely summarized short phrases (not full sentences copied verbatim from the note, not the note chopped into lines) — capture the key details/sub-steps a reader would need beyond the title.
- Do NOT include time/duration estimates in description_points (e.g. "about an hour", "30 min") — that information belongs only in time_estimate_min, never repeated as a bullet.
- Recent corrections the user made to past classifications are provided — match their judgment.`;

function validateItem(obj: unknown): Classification | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (!KINDS.includes(o.kind as CaptureKind) || !PRIORITIES.includes(o.priority as Priority)) return null;
  if (o.category !== undefined && !CATEGORIES.includes(o.category as Category)) return null;
  if (typeof o.summary !== 'string' || !o.summary.trim()) return null;
  const description_points = Array.isArray(o.description_points)
    ? o.description_points
        .filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
        .slice(0, 6)
        .map((p: string) => p.trim().slice(0, 200))
    : [];
  return {
    kind: o.kind as CaptureKind,
    priority: o.priority as Priority,
    category: CATEGORIES.includes(o.category as Category) ? (o.category as Category) : 'personal',
    tags: Array.isArray(o.tags) ? o.tags.filter((t: unknown): t is string => typeof t === 'string').slice(0, 3) : [],
    summary: o.summary.trim().slice(0, 120),
    description_points,
    time_estimate_min: typeof o.time_estimate_min === 'number' ? Math.round(o.time_estimate_min) : null,
    low_confidence: false,
  };
}

export function parseClassifications(raw: string): Classification[] | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(obj.items)) return null;
    const valid = obj.items.map(validateItem).filter((c: Classification | null): c is Classification => c !== null);
    if (valid.length === 0) return null;
    return valid;
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
  const priority: Priority =
    /\b(today|tonight|asap|right now|urgent)\b/.test(lower) ? 'today' : 'dash';
  const category: Category =
    /\b(invoice|deadline|colleague|boss|work)\b/.test(lower) ? 'business' : 'personal';
  return {
    kind, priority, category, tags: [],
    summary: text.trim().slice(0, 120),
    description_points: [],
    time_estimate_min: null,
    low_confidence: true,
  };
}

function userContent(text: string, overrides: string[]): string {
  return `Recent corrections (was → corrected):\n${overrides.join('\n') || '(none)'}\n\nNote:\n${text}`;
}

const PROVIDER_TIMEOUT_MS = 15_000;

/**
 * A provider that hangs (rather than erroring) must still degrade to the next
 * link in the fallback chain — a bare fetch() with no timeout would block
 * classifyCapture indefinitely and defeat the whole point of the chain.
 */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function claudeClassify(text: string, overrides: string[]): Promise<Classification[] | null> {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': requireEnv('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent(text, overrides) }],
    }),
  });
  if (!res.ok) {
    console.error('anthropic classify failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return parseClassifications(json.content?.[0]?.text ?? '');
}

async function openaiClassify(text: string, overrides: string[]): Promise<Classification[] | null> {
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
  return parseClassifications(json.choices?.[0]?.message?.content ?? '');
}

export async function classifyCapture(
  text: string, overrides: string[],
): Promise<{ classifications: Classification[]; llm_source: string }> {
  const fromClaude = await claudeClassify(text, overrides).catch((e) => { console.error(e); return null; });
  if (fromClaude) return { classifications: fromClaude, llm_source: 'anthropic' };
  const fromOpenAI = await openaiClassify(text, overrides).catch((e) => { console.error(e); return null; });
  if (fromOpenAI) return { classifications: fromOpenAI, llm_source: 'openai' };
  return { classifications: [regexClassify(text)], llm_source: 'regex' };
}
