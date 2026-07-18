import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processCapture } from '@/lib/capture';
import { transcribeOgg } from '@/lib/transcribe';
import { tgSendMessage, tgAnswerCallback, tgGetFileBuffer } from '@/lib/telegram';
import { serviceClient, USER_ID } from '@/lib/supabase';

export const maxDuration = 60;

/**
 * Constant-time secret comparison. This route sits in middleware.ts's public
 * prefix list (no cookie/x-api-secret layer) — the secret-token check below
 * is the ONLY gate on a publicly-reachable URL, so a plain !== comparison's
 * theoretical timing leak is worth closing here even though it wasn't for
 * lower-stakes internal routes elsewhere in the app.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

interface TelegramMessage {
  from?: { id: number };
  chat: { id: number };
  text?: string;
  voice?: { file_id: string };
}

interface CallbackQuery {
  id: string;
  from?: { id: number };
  data?: string;
  message?: { chat: { id: number } };
}

// callback_data must stay <=64 bytes: "p|<uuid36>|today" = 43 bytes,
// "c|<uuid36>|business" = 46 bytes. Both OK.
function taskActionKeyboard(taskId: string) {
  return {
    inline_keyboard: [
      [
        { text: '⭐ Today', callback_data: `p|${taskId}|today` },
        { text: 'Not today', callback_data: `p|${taskId}|dash` },
      ],
      [
        { text: 'Personal', callback_data: `c|${taskId}|personal` },
        { text: 'Business', callback_data: `c|${taskId}|business` },
      ],
    ],
  };
}

export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secretHeader || !expectedSecret || !safeEqual(secretHeader, expectedSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // req.json() sat outside the try/catch below, so a malformed body (or an
  // attacker probing this publicly-reachable URL, since it has no other
  // auth layer) would throw before reaching it — producing a non-200
  // response and defeating the "always 200, avoid Telegram retry storms"
  // goal the comment at the bottom of this function describes.
  let update: {
    message?: unknown;
    callback_query?: unknown;
  };
  try {
    update = await req.json();
  } catch (err) {
    console.error('webhook: malformed update body', err);
    return NextResponse.json({ ok: true });
  }

  // Tracks whether processCapture already succeeded before a later step
  // (e.g. the confirmation reply) fails, so the error message sent back
  // doesn't falsely tell the user their capture was lost when it wasn't.
  let captureSucceeded = false;
  try {
    if (update.callback_query) await handleCallback(update.callback_query as CallbackQuery);
    else if (update.message) await handleMessage(update.message as TelegramMessage, () => { captureSucceeded = true; });
  } catch (err) {
    console.error('webhook error', err);
    const message = update.message as TelegramMessage | undefined;
    const callback = update.callback_query as CallbackQuery | undefined;
    const chatId = message?.chat?.id ?? callback?.message?.chat?.id;
    if (chatId) {
      const text = captureSucceeded
        ? `⚠️ Saved, but couldn't send the confirmation: ${(err as Error).message}`
        : `⚠️ Capture failed: ${(err as Error).message}`;
      await tgSendMessage(chatId, text).catch((e) => console.error('error-reply failed', e));
    }
  }
  // Always 200 — otherwise Telegram retry-storms the endpoint.
  return NextResponse.json({ ok: true });
}

async function handleMessage(message: TelegramMessage, onCaptureSucceeded: () => void) {
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

  const outcome = await processCapture({ text, source: 'telegram', audioUrl });
  onCaptureSucceeded();

  if (outcome.type === 'edited') {
    await tgSendMessage(chatId, `✅ Updated '${outcome.title}': ${outcome.summary}`);
    return;
  }
  if (outcome.type === 'ambiguous') {
    const list = outcome.candidateTitles.map((t) => `• ${t}`).join('\n');
    await tgSendMessage(chatId, `Found ${outcome.candidateTitles.length} tasks that could match — which one?\n${list}`);
    return;
  }
  if (outcome.type === 'no_match') {
    await tgSendMessage(chatId, "Couldn't find a task matching that — did you mean to create a new one?");
    return;
  }

  // One reply per extracted item, so multiple tasks pulled from a single
  // message each get their own independently-actionable message (and their
  // own inline keyboard for tasks) instead of being crammed into one.
  for (const result of outcome.results) {
    const c = result.classification;
    const flag = c.low_confidence ? ' (low confidence — AI was down)' : '';

    try {
      if (c.kind === 'task' && result.routedId) {
        const est = c.time_estimate_min ? ` · est ${c.time_estimate_min}m` : '';
        const priorityLabel = c.priority === 'today' ? 'Today' : '—';
        await tgSendMessage(
          chatId,
          `✅ Task: ${c.summary}\n${priorityLabel} · ${c.category}${est}${flag}`,
          taskActionKeyboard(result.routedId),
        );
      } else if (c.kind === 'journal') {
        await tgSendMessage(chatId, `📓 Reflection saved for today.${flag}`);
      } else {
        await tgSendMessage(chatId, `🎯 Goal added: ${c.summary}${flag}`);
      }
    } catch (err) {
      // Don't let one failed reply abort the rest — the underlying task was
      // already created successfully; only the notification for THIS item
      // failed, and the remaining items' replies (and their action
      // keyboards) should still be attempted.
      console.error('telegram reply failed for one capture item', result.routedId, err);
    }
  }
}

async function handleCallback(cb: CallbackQuery) {
  if (String(cb.from?.id) !== process.env.TELEGRAM_USER_ID) return;
  const [op, taskId, value] = String(cb.data ?? '').split('|');
  if (!op || !taskId) return;
  const db = serviceClient();

  if (op === 'p') {
    const { error } = await db.from('tasks')
      .update({ key: value === 'today', updated_at: new Date().toISOString() })
      .eq('id', taskId).eq('user_id', USER_ID);
    if (error) throw new Error(error.message);
    await recordOverride(taskId, { key: value === 'today' });
    await tgAnswerCallback(cb.id, value === 'today' ? '⭐ Marked Today' : 'Unmarked');
  } else if (op === 'c') {
    const { error } = await db.from('tasks')
      .update({ category: value, updated_at: new Date().toISOString() })
      .eq('id', taskId).eq('user_id', USER_ID);
    if (error) throw new Error(error.message);
    await recordOverride(taskId, { category: value });
    await tgAnswerCallback(cb.id, `Set to ${value}`);
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
