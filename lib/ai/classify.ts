import { requireEnv } from '@/lib/auth';

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

async function claudeClassify(text: string, overrides: string[]): Promise<Classification | null> {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': requireEnv('ANTHROPIC_API_KEY'),
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
