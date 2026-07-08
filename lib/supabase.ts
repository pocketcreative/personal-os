import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/auth';

export const USER_ID = process.env.USER_ID ?? 'brendan';

/** Service-role client. SERVER ONLY — never import from a client component. */
export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}
