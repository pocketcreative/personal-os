// Pure helpers for view-only share links. SERVER ONLY (uses node:crypto);
// client components may `import type` from here, never import values.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { filterForAudience } from '@/lib/sopMarkdown';
import { parseScene } from '@/lib/boardScene';
import { stripFrontmatter } from '@/lib/skillFile';
import type { ContentIdea, ContentItem } from '@/lib/types';

// 'cms' shares the whole Content Management System (every content_items row
// across lf/lts/sf/ad/vsl), not one row in one table -- see toSharedCms and
// migration 0037. Every other kind is unchanged from before.
export type ShareResource = 'sop' | 'board' | 'skill' | 'cms';

export const SHARES_MISSING_MESSAGE = 'Sharing needs one database step, ask Jarvis';
// Migration 0029 not applied yet: the resource_type check rejects 'skill'.
export const SHARES_SKILL_MISSING_MESSAGE = 'Sharing skills needs one database step, ask Jarvis';

// Columns read server side. user_id is never sent anywhere. password_hash is
// read for verification only -- withStatus() below strips it before any
// response reaches the owner's browser, and it's never sent to the public
// share routes' callers either.
export const SHARE_COLUMNS = 'id,resource_type,resource_id,token,expires_at,revoked_at,created_at,password_hash';

export type ShareStatus = 'active' | 'expired' | 'off';

export interface ShareRow {
  id: string;
  resource_type: ShareResource;
  resource_id: string | null; // null only for resource_type 'cms'
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  password_hash: string | null;
}

export type ShareWithStatus = Omit<ShareRow, 'password_hash'> & { status: ShareStatus; has_password: boolean };

// Headers on every public response: never cached, never indexed.
export const PUBLIC_HEADERS = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
} as const;

// 32 random bytes as base64url is always 43 characters.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

// Checked before any database call, so junk never reaches the query.
export function isValidTokenShape(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function isShareResource(v: unknown): v is ShareResource {
  return v === 'sop' || v === 'board' || v === 'skill' || v === 'cms';
}

export function isShareActive(share: { expires_at: string | null; revoked_at: string | null }, now: Date): boolean {
  if (share.revoked_at) return false;
  if (share.expires_at && new Date(share.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

export function shareStatus(share: { expires_at: string | null; revoked_at: string | null }, now: Date): ShareStatus {
  if (share.revoked_at) return 'off';
  return isShareActive(share, now) ? 'active' : 'expired';
}

export function withStatus(share: ShareRow, now = new Date()): ShareWithStatus {
  const { password_hash, ...rest } = share;
  return { ...rest, status: shareStatus(share, now), has_password: !!password_hash };
}

// scrypt, not the app's login-gate plain-env-var compare: a share password
// is chosen by whoever creates the link and stored in the DB, so it needs a
// real per-password salt rather than a single shared secret. Format is
// "salt:hash", both hex, so one text column holds everything.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = scryptSync(password, salt, 64);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// The signed-cookie gate for a password-protected share (see lib/auth.ts's
// createSignedToken/verifySignedToken, built for exactly this). Both the
// cookie name and the signed token's `name` are bound to the specific share
// token, so a cookie proving one share's password can never unlock another.
export function shareCookieName(token: string): string {
  return `sh_pw_${token}`;
}
export function shareTokenName(token: string): string {
  return `share:${token}`;
}

// The expiry the owner picks is a date ("Expires on"). It means the end of
// that day in Singapore time. A full timestamp is also accepted. Empty or
// missing means the link never expires. Must be in the future.
export function parseExpiry(input: unknown, now: Date): { ok: true; value: string | null } | { ok: false } {
  if (input === undefined || input === null || input === '') return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false };
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
  const d = new Date(isDate ? `${input}T23:59:59+08:00` : input);
  if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) return { ok: false };
  return { ok: true, value: d.toISOString() };
}

// What a link holder gets for an SOP: the client version only, nothing else.
export function toSharedSop(sop: { title: string; version: string; version_date: string; content: string }) {
  return {
    type: 'sop' as const,
    title: sop.title,
    version: sop.version,
    version_date: sop.version_date,
    content: filterForAudience(sop.content ?? '', 'client'),
  };
}

// What a link holder gets for a board: title and the scene (elements, files,
// the small appState subset), nothing else.
export function toSharedBoard(board: { title: string; scene: unknown }) {
  return { type: 'board' as const, title: board.title, scene: parseScene(board.scene) };
}

// What a link holder gets for a skill: what SkillDetail shows in read mode
// (slug as the title, the content without its YAML frontmatter), passed
// through the same client filter as SOPs.
export function toSharedSkill(skill: { slug: string; version: string; version_date: string; content: string }) {
  return {
    type: 'skill' as const,
    title: skill.slug,
    version: skill.version,
    version_date: skill.version_date,
    content: filterForAudience(stripFrontmatter(skill.content ?? ''), 'client'),
  };
}

// What a link holder gets for a 'cms' share: every content_items row across
// all 5 types, read-only fields only -- no user_id, no zernio_post_ids (an
// internal scheduling detail, not something an external viewer needs).
// post_time and sort_order added so the shared page can reuse the real
// board/calendar components unmodified (they read these to show a post's
// time and keep board-column order) -- neither reveals anything Brendan
// didn't already choose to put on the card itself.
export interface SharedCmsItem {
  id: string;
  type: ContentItem['type'];
  name: string;
  stage: string;
  status: string | null;
  post_date: string | null;
  post_time: string | null;
  sort_order: number | null;
  body_md: string;
  platforms: string[];
  caption: string | null;
  raw_footage: string | null;
  posted_footage: string | null;
  reference_video: string | null;
  asset_link: string | null;
}

// The 'cms' share's Ideas tab: content_ideas rows, same read/limited-edit
// treatment as content_items (idea/notes/used are the editable fields --
// see app/api/share/[token]/content-ideas/[id]/route.ts).
export interface SharedIdea {
  id: string;
  idea: string;
  notes: string | null;
  used: boolean;
}

export function toSharedCms(items: ContentItem[], ideas: ContentIdea[] = []) {
  return {
    type: 'cms' as const,
    title: 'Content Management System',
    items: items.map((i): SharedCmsItem => ({
      id: i.id,
      type: i.type,
      name: i.name,
      stage: i.stage,
      status: i.status,
      post_date: i.post_date,
      post_time: i.post_time,
      sort_order: i.sort_order,
      body_md: i.body_md,
      platforms: i.platforms,
      caption: i.caption,
      raw_footage: i.raw_footage,
      posted_footage: i.posted_footage,
      reference_video: i.reference_video,
      asset_link: i.asset_link,
    })),
    ideas: ideas.map((i): SharedIdea => ({ id: i.id, idea: i.idea, notes: i.notes, used: i.used })),
  };
}
