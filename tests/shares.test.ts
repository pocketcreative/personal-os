import { describe, expect, it } from 'vitest';
import {
  generateToken, isShareActive, isUuid, isValidTokenShape, parseExpiry, shareStatus, toSharedBoard, toSharedSkill, toSharedSop, isShareResource,
} from '@/lib/shares';

const now = new Date('2026-09-25T12:00:00Z');

describe('generateToken', () => {
  it('is 43 base64url characters and never repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });
  it('passes its own shape check', () => {
    expect(isValidTokenShape(generateToken())).toBe(true);
  });
});

describe('isValidTokenShape', () => {
  it('rejects wrong length, charset and types', () => {
    expect(isValidTokenShape('')).toBe(false);
    expect(isValidTokenShape('a'.repeat(42))).toBe(false);
    expect(isValidTokenShape('a'.repeat(44))).toBe(false);
    expect(isValidTokenShape(`${'a'.repeat(42)}=`)).toBe(false);
    expect(isValidTokenShape(`${'a'.repeat(42)}/`)).toBe(false);
    expect(isValidTokenShape(`${'a'.repeat(41)}%2e`)).toBe(false);
    expect(isValidTokenShape(`${'a'.repeat(41)}..`)).toBe(false);
    expect(isValidTokenShape(undefined)).toBe(false);
    expect(isValidTokenShape(123)).toBe(false);
    expect(isValidTokenShape('a'.repeat(43))).toBe(true);
  });
});

describe('isUuid', () => {
  it('accepts uuids only', () => {
    expect(isUuid('3f2b8c1e-5d4a-4b6e-9c7d-1a2b3c4d5e6f')).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid('3f2b8c1e-5d4a-4b6e-9c7d-1a2b3c4d5e6f; drop')).toBe(false);
  });
});

describe('isShareActive / shareStatus', () => {
  it('is active with no expiry and not revoked', () => {
    expect(isShareActive({ expires_at: null, revoked_at: null }, now)).toBe(true);
    expect(shareStatus({ expires_at: null, revoked_at: null }, now)).toBe('active');
  });
  it('is active before its expiry, inactive at and after it', () => {
    expect(isShareActive({ expires_at: '2026-09-26T00:00:00Z', revoked_at: null }, now)).toBe(true);
    expect(isShareActive({ expires_at: '2026-09-25T12:00:00Z', revoked_at: null }, now)).toBe(false);
    expect(shareStatus({ expires_at: '2026-09-24T00:00:00Z', revoked_at: null }, now)).toBe('expired');
  });
  it('is off when revoked, even if not expired', () => {
    expect(isShareActive({ expires_at: null, revoked_at: '2026-09-25T00:00:00Z' }, now)).toBe(false);
    expect(shareStatus({ expires_at: '2026-12-01T00:00:00Z', revoked_at: '2026-09-25T00:00:00Z' }, now)).toBe('off');
  });
});

describe('parseExpiry', () => {
  it('treats empty as never expires', () => {
    expect(parseExpiry(undefined, now)).toEqual({ ok: true, value: null });
    expect(parseExpiry('', now)).toEqual({ ok: true, value: null });
    expect(parseExpiry(null, now)).toEqual({ ok: true, value: null });
  });
  it('turns a date into the end of that day in Singapore', () => {
    expect(parseExpiry('2026-10-01', now)).toEqual({ ok: true, value: '2026-10-01T15:59:59.000Z' });
  });
  it('accepts a future timestamp', () => {
    expect(parseExpiry('2026-10-01T00:00:00Z', now)).toEqual({ ok: true, value: '2026-10-01T00:00:00.000Z' });
  });
  it('rejects past, junk and non-strings', () => {
    expect(parseExpiry('2026-09-01', now)).toEqual({ ok: false });
    expect(parseExpiry('not a date', now)).toEqual({ ok: false });
    expect(parseExpiry(5, now)).toEqual({ ok: false });
  });
});

describe('toSharedSop', () => {
  const row = {
    title: 'Onboarding', version: '1.3', version_date: '2026-09-20', user_id: 'brendan', id: 'x', skill_id: 'y',
    content: '## Goal\n[Internal] Secret margin notes\n[Client] Welcome aboard\nShared line\n',
  };
  it('returns only the client version and the four public fields', () => {
    const out = toSharedSop(row);
    expect(Object.keys(out).sort()).toEqual(['content', 'title', 'type', 'version', 'version_date']);
    expect(out.content).not.toContain('Secret margin notes');
    expect(out.content).not.toContain('[Client]');
    expect(out.content).toContain('Welcome aboard');
    expect(out.content).toContain('Shared line');
  });
});

describe('toSharedBoard', () => {
  it('returns title and a cleaned scene only', () => {
    const out = toSharedBoard({
      title: 'Plan', user_id: 'brendan',
      scene: { elements: [{ id: 'a' }], files: {}, appState: { scrollX: 1, selectedElementIds: { a: true } }, junk: 1 },
    } as { title: string; scene: unknown });
    expect(Object.keys(out).sort()).toEqual(['scene', 'title', 'type']);
    expect(out.scene).toEqual({ elements: [{ id: 'a' }], files: {}, appState: { scrollX: 1 } });
  });
});

describe('toSharedSkill', () => {
  const row = {
    slug: 'humanizer', version: '2.1', version_date: '2026-09-20', user_id: 'brendan', id: 'x', source: 'brendan',
    content: '---\nname: humanizer\ndescription: strips AI tells\n---\n## Steps\n[Internal] Secret tuning notes\n[Client] Read it aloud\nShared line\n',
  };
  it('returns only the client version and the five public fields', () => {
    const out = toSharedSkill(row);
    expect(Object.keys(out).sort()).toEqual(['content', 'title', 'type', 'version', 'version_date']);
    expect(out.type).toBe('skill');
    expect(out.title).toBe('humanizer');
    expect(out.content).not.toContain('Secret tuning notes');
    expect(out.content).not.toContain('[Client]');
    expect(out.content).toContain('Read it aloud');
    expect(out.content).toContain('Shared line');
  });
  it('drops the YAML frontmatter like the read view does', () => {
    expect(toSharedSkill(row).content).not.toContain('description:');
    expect(toSharedSkill(row).content.startsWith('## Steps')).toBe(true);
  });
});

describe('isShareResource', () => {
  it('accepts sop, board and skill only', () => {
    expect(isShareResource('skill')).toBe(true);
    expect(isShareResource('sop')).toBe(true);
    expect(isShareResource('board')).toBe(true);
    expect(isShareResource('agent')).toBe(false);
  });
});
