import { google, drive_v3 } from 'googleapis';
import { requireEnv } from '@/lib/auth';

let auth: InstanceType<typeof google.auth.GoogleAuth> | undefined;
let drive: drive_v3.Drive | undefined;

/**
 * Service-account Drive client, read-only scope. SERVER ONLY.
 * Memoized as a lazy singleton, same pattern as lib/supabase.ts: the
 * GoogleAuth instance internally caches its own access token, so reusing one
 * instance across requests avoids re-parsing the key and re-authenticating
 * on every stream request.
 */
export function driveClient(): drive_v3.Drive {
  if (!drive) {
    const raw = requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
    let credentials: { client_email: string; private_key: string };
    try {
      credentials = JSON.parse(raw);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    drive = google.drive({ version: 'v3', auth });
  }
  return drive;
}
