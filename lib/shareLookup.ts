import { serviceClient } from '@/lib/supabase';
import { SHARE_COLUMNS, isShareActive, isValidTokenShape, type ShareRow } from '@/lib/shares';

// Looks up an ACTIVE share by token for the public routes. Returns null for
// every failure (bad shape, unknown, revoked, expired, table missing, DB
// error) so callers cannot tell the cases apart. SERVER ONLY.
export async function findActiveShare(token: string): Promise<ShareRow | null> {
  if (!isValidTokenShape(token)) return null;
  const { data, error } = await serviceClient().from('shares').select(SHARE_COLUMNS).eq('token', token).maybeSingle();
  if (error) {
    // A missing table just means no link can exist yet; anything else is worth a log.
    if (error.code !== 'PGRST205' && error.code !== '42P01') console.error('share lookup failed', error.code);
    return null;
  }
  if (!data || !isShareActive(data as ShareRow, new Date())) return null;
  return data as ShareRow;
}
