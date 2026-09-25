// Pure helpers for view-only share links. SERVER ONLY (uses node:crypto);
// client components may `import type` from here, never import values.
import { randomBytes } from 'node:crypto';
import { filterForAudience } from '@/lib/sopMarkdown';
import { parseScene } from '@/lib/boardScene';
import { stripFrontmatter } from '@/lib/skillFile';

export type ShareResource = 'sop' | 'board' | 'skill';

export const SHARES_MISSING_MESSAGE = 'Sharing needs one database step, ask Jarvis';
// Migration 0029 not applied yet: the resource_type check rejects 'skill'.
export const SHARES_SKILL_MISSING_MESSAGE = 'Sharing skills needs one database step, ask Jarvis';

// Columns returned to the owner. user_id is never sent anywhere.
export const SHARE_COLUMNS = 'id,resource_type,resource_id,token,expires_at,revoked_at,created_at';

export type ShareStatus = 'active' | 'expired' | 'off';

export interface ShareRow {
  id: string;
  resource_type: ShareResource;
  resource_id: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type ShareWithStatus = ShareRow & { status: ShareStatus };

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
  return v === 'sop' || v === 'board' || v === 'skill';
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
  return { ...share, status: shareStatus(share, now) };
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
