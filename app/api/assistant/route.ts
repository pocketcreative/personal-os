import { NextRequest, NextResponse } from 'next/server';
import { processCapture } from '@/lib/capture';
import { runSmartQuery } from '@/lib/ai/smartQuery';

// Worst case, processCapture's classifier chain alone can spend ~30s
// (15s Claude timeout + 15s OpenAI timeout) before even falling back to
// regex — leave headroom for that plus the Supabase reads/writes on top,
// same reasoning as app/api/capture/route.ts.
export const maxDuration = 60;

// Cheap heuristic for "question/analysis" vs "action" (create/edit) —
// deliberately NOT another LLM call, to keep this routing decision free.
function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith('?')) return true;
  const lower = trimmed.toLowerCase();
  const startsWith = ['what', 'which', 'should', 'how', 'why', 'who'];
  if (startsWith.some((w) => lower.startsWith(w))) return true;
  const phrases = ['prioriti', 'focus on', "what's next", 'recommend'];
  return phrases.some((p) => lower.includes(p));
}

// Routing logic shared by the text (this route) and voice
// (app/api/assistant/voice) paths — a transcribed voice message runs
// through the exact same question/action classification and downstream
// handlers as typed text. Capture failures are left to throw so each
// caller can decide its own response status (text route uses 500 like
// before; the voice route always answers 200 with a type:'error' body).
export async function handleAssistantText(text: string) {
  const trimmed = text.trim();

  if (isQuestion(trimmed)) {
    const result = await runSmartQuery(trimmed);
    if ('error' in result) return { type: 'error' as const, message: result.error };
    return { type: 'answer' as const, note: result.note, ids: result.ids };
  }

  return processCapture({ text: trimmed, source: 'web' });
}

export async function POST(req: NextRequest) {
  const { text } = await req.json().catch(() => ({ text: '' }));
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });

  try {
    const outcome = await handleAssistantText(text);
    return NextResponse.json(outcome);
  } catch (err) {
    console.error('assistant capture failed', err);
    return NextResponse.json({ type: 'error', message: (err as Error).message }, { status: 500 });
  }
}
