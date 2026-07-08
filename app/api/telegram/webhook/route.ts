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
