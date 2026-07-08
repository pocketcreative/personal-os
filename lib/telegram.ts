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
