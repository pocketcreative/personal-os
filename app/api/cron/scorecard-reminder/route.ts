import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/lib/auth';
import { localDateKey } from '@/lib/dates';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { tgSendMessage } from '@/lib/telegram';

// Hit at 10:30pm SGT (14:30 UTC) by cron-job.org. Public under middleware's
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
  const { data, error } = await serviceClient().from('scorecard_day_items')
    .select('done').eq('user_id', USER_ID).eq('date', today);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const total = data?.length ?? 0;
  const done = data?.filter((i) => i.done).length ?? 0;
  // Send only if today isn't logged or isn't fully ticked.
  if (total > 0 && done === total) return NextResponse.json({ ok: true, sent: false, reason: 'complete' });

  const text = total === 0
    ? 'Scorecard: today isn’t logged yet. Tick your habits before 11pm.\nhttps://platform.acquireclients.ai/scorecard'
    : `Scorecard: ${done} of ${total} done today. Finish logging before 11pm.\nhttps://platform.acquireclients.ai/scorecard`;
  await tgSendMessage(requireEnv('TELEGRAM_USER_ID'), text);
  return NextResponse.json({ ok: true, sent: true, done, total });
}
