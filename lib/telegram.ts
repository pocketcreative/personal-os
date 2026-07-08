const api = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function tgCall(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${api()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  // Auth failures, rate limits, and infra errors aren't guaranteed to return
  // JSON with an `ok` field — guard the parse so failures surface as a clear
  // "telegram X failed" error instead of a raw SyntaxError on a non-JSON body.
  let json: TelegramResponse;
  try {
    json = await res.json();
  } catch {
    const body = await res.text().catch(() => '<unreadable body>');
    throw new Error(`telegram ${method} failed: non-JSON response (status ${res.status}): ${body.slice(0, 200)}`);
  }
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
  const file = (await tgCall('getFile', { file_id: fileId })) as { file_path?: string };
  if (!file.file_path) throw new Error('telegram getFile returned no file_path (file may be too large to download)');
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!res.ok) throw new Error(`telegram file download failed: ${res.status}`);
  return res.arrayBuffer();
}
