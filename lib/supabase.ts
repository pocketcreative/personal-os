import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/auth';

export const USER_ID = process.env.USER_ID ?? 'brendan';

let client: SupabaseClient | undefined;

/**
 * Service-role client. SERVER ONLY — never import from a client component.
 * Memoized as a lazy singleton: this client carries no per-request auth/cookie
 * state, so reusing one instance across calls is safe and avoids rebuilding
 * the SDK's internal sub-clients on every invocation.
 */
export function serviceClient(): SupabaseClient {
  return (client ??= createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  ));
}
