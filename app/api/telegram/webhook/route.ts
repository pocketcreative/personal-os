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

const URGENCY_LABELS: Record<string, string> = {
  today: 'Today', this_week: 'This Week', this_month: 'This Month', someday: 'Someday',
};

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

  const result = await processCapture({ text, source: 'telegram', audioUrl });
  onCaptureSucceeded();
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

async function handleCallback(cb: CallbackQuery) {
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
