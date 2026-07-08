const enc = new TextEncoder();

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const SESSION_COOKIE = 'pos_session';

export async function createSessionToken(secret: string, ttlMs = 30 * 24 * 60 * 60 * 1000): Promise<string> {
  const exp = Date.now() + ttlMs;
  return `${exp}.${await hmacHex(String(exp), secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  if (!expStr || !sig) return false;
  if (!Number(expStr) || Number(expStr) < Date.now()) return false;
  return (await hmacHex(expStr, secret)) === sig;
}
