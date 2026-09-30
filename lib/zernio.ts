import type { ZernioPostRef } from '@/lib/types';

// Real server-side Zernio REST client -- NOT a stub. Confirmed 2026-09-30 via
// Zernio's own docs (mcp__zernio__docs_search) that the API is a plain
// Bearer-token REST API (base https://zernio.com/api/v1), not something that
// requires an interactive MCP session, so it can be called directly from
// Personal OS's own backend using the ZERNIO_API_KEY that already sits in
// .env.local (added 2026-09-05, unused until now).
//
// Two currently-connected accounts (confirmed live via accounts_list):
//   instagram: brendanangg  (69c4a3f66cb7b8cf4c9e6e07)
//   facebook:  pocketcreativesg (6a9bc42177555aae01dee57e)
// No YouTube account is connected, so LF items (YouTube-only) cannot be
// scheduled through Zernio yet -- see scheduleToZernio's early return below.
// This is a real, current limitation, not a bug in this code.

const ZERNIO_BASE = 'https://zernio.com/api/v1';

// Platform name (as typed into an item's `platforms` field, e.g. "Instagram",
// "instagram", "IG") -> the Zernio platform id + connected account id.
// Extend this map the moment a new account gets connected in Zernio (e.g.
// YouTube for LF) -- nothing else in this file needs to change.
const PLATFORM_ACCOUNTS: Record<string, { platform: string; accountId: string }> = {
  instagram: { platform: 'instagram', accountId: '69c4a3f66cb7b8cf4c9e6e07' },
  ig: { platform: 'instagram', accountId: '69c4a3f66cb7b8cf4c9e6e07' },
  facebook: { platform: 'facebook', accountId: '6a9bc42177555aae01dee57e' },
  fb: { platform: 'facebook', accountId: '6a9bc42177555aae01dee57e' },
};

function resolveAccount(platformName: string) {
  return PLATFORM_ACCOUNTS[platformName.trim().toLowerCase()] ?? null;
}

function apiKey(): string | null {
  return process.env.ZERNIO_API_KEY || null;
}

async function zernioFetch(path: string, init: RequestInit) {
  const key = apiKey();
  if (!key) throw new Error('ZERNIO_API_KEY not set');
  const res = await fetch(`${ZERNIO_BASE}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const message = (body && typeof body === 'object' && 'message' in body) ? String((body as { message: unknown }).message) : text;
    throw new Error(`Zernio ${init.method ?? 'GET'} ${path} -> ${res.status}: ${message}`);
  }
  return body as Record<string, unknown>;
}

// Real POST /v1/posts, one call per platform (Zernio can take multiple
// platforms in one post, but keeping it one-call-per-platform here means a
// per-platform failure doesn't sink the others, and each gets its own
// tracked post_id in zernio_post_ids).
export async function scheduleToZernio(params: {
  content: string;
  platforms: string[];
  scheduledForISO: string; // local (Asia/Singapore) time, no Z suffix -- matches Zernio's scheduledFor + timezone contract
}): Promise<ZernioPostRef[]> {
  const results: ZernioPostRef[] = [];
  if (!apiKey()) {
    // No key configured -- real TODO, not a fake success. Every platform
    // comes back explicitly not_configured rather than silently doing nothing.
    return params.platforms.map((platform) => ({
      platform, account_id: '', post_id: '', status: 'not_configured', scheduled_for: null,
      error: 'ZERNIO_API_KEY not set',
    }));
  }
  for (const platformName of params.platforms) {
    const account = resolveAccount(platformName);
    if (!account) {
      results.push({
        platform: platformName, account_id: '', post_id: '', status: 'not_configured', scheduled_for: null,
        error: `No Zernio account connected for "${platformName}" (only Instagram + Facebook are connected as of 2026-09-30)`,
      });
      continue;
    }
    try {
      const res = await zernioFetch('/posts', {
        method: 'POST',
        body: JSON.stringify({
          content: params.content,
          scheduledFor: params.scheduledForISO,
          timezone: 'Asia/Singapore',
          platforms: [{ platform: account.platform, accountId: account.accountId }],
        }),
      });
      const post = res.post as { _id?: string } | undefined;
      results.push({
        platform: platformName, account_id: account.accountId, post_id: post?._id ?? '',
        status: 'scheduled', scheduled_for: params.scheduledForISO,
      });
    } catch (e) {
      results.push({
        platform: platformName, account_id: account.accountId, post_id: '', status: 'failed',
        scheduled_for: null, error: (e as Error).message,
      });
    }
  }
  return results;
}

// Real PUT /v1/posts/{postId} -- reschedules an already-created Zernio post
// (e.g. a calendar drag to a new date/time). Only touches refs that are
// actually `scheduled` with a real post_id; anything not_configured/failed
// is left alone (nothing to reschedule).
export async function rescheduleZernioPosts(
  refs: ZernioPostRef[],
  newScheduledForISO: string,
  newContent?: string,
): Promise<ZernioPostRef[]> {
  if (!apiKey()) return refs;
  const updated: ZernioPostRef[] = [];
  for (const ref of refs) {
    if (ref.status !== 'scheduled' || !ref.post_id) { updated.push(ref); continue; }
    try {
      await zernioFetch(`/posts/${ref.post_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          scheduledFor: newScheduledForISO, isDraft: false,
          ...(newContent ? { content: newContent } : {}),
        }),
      });
      updated.push({ ...ref, scheduled_for: newScheduledForISO });
    } catch (e) {
      updated.push({ ...ref, status: 'failed', error: (e as Error).message });
    }
  }
  return updated;
}

// Real DELETE /v1/posts/{postId} -- cancels a Zernio-scheduled post (e.g. the
// item is deleted, or moved off a Post Date entirely).
export async function cancelZernioPosts(refs: ZernioPostRef[]): Promise<void> {
  if (!apiKey()) return;
  for (const ref of refs) {
    if (ref.status !== 'scheduled' || !ref.post_id) continue;
    try { await zernioFetch(`/posts/${ref.post_id}`, { method: 'DELETE' }); } catch { /* best-effort */ }
  }
}
