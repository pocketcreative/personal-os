import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/lib/auth';
import { localDateKey } from '@/lib/dates';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { tgSendMessage } from '@/lib/telegram';

// Hit at 9:00, 9:30 and 10:00pm SGT by cron-job.org (two jobs). Public under middleware's
// '/api/cron/' prefix, so the CRON_SECRET check below is the only gate.
export const runtime = 'nodejs';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!safeEqual(authHeader, `Bearer ${requireEnv('CRON_SECRET')}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const today = localDateKey();
  const db = serviceClient();
  const { data: day, error: dayErr } = await db.from('scorecard_days')
    .select('submitted_at').eq('user_id', USER_ID).eq('date', today).maybeSingle();
  if (dayErr) return NextResponse.json({ ok: false, error: dayErr.message }, { status: 500 });
  // Rule: once today is submitted, no more reminders (Edit clears it again).
  if (day?.submitted_at) return NextResponse.json({ ok: true, sent: false, reason: 'submitted' });

  const { data, error } = await db.from('scorecard_day_items')
    .select('done').eq('user_id', USER_ID).eq('date', today);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const total = data?.length ?? 0;
  const done = data?.filter((i) => i.done).length ?? 0;
  const text = total === 0
    ? 'Scorecard: today isn’t logged yet. Tick your habits, then press Submit.\nhttps://platform.acquireclients.ai/scorecard'
    : `Scorecard: ${done} of ${total} ticked, not submitted yet. Finish ticking, then press Submit.\nhttps://platform.acquireclients.ai/scorecard`;
  await tgSendMessage(requireEnv('TELEGRAM_USER_ID'), text);
  return NextResponse.json({ ok: true, sent: true, done, total });
}
