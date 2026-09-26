// Pure logic for the TA & Offer page: Target Audience, Workshop Offer, Partnership Offer
// (no database, no React).

// The three documents. `key` is what the page link uses (?doc=) and what the switch
// shows; `slug` is the row in the database. The Partnership Offer keeps the database
// slug `offer` because that row already existed and is live, so it is never renamed.
// This is the only place that mapping lives.
export const DOC_OPTIONS = [
  { key: 'target-audience', slug: 'target-audience', label: 'Target Audience' },
  { key: 'workshop-offer', slug: 'workshop-offer', label: 'Workshop Offer' },
  { key: 'partnership-offer', slug: 'offer', label: 'Partnership Offer' },
] as const;

export type DocKey = (typeof DOC_OPTIONS)[number]['key'];
export type DocSlug = (typeof DOC_OPTIONS)[number]['slug'];

export const DEFAULT_DOC_KEY: DocKey = 'target-audience';

/** Database slugs the API accepts. Anything else is a 404. */
export const DOC_SLUGS: readonly string[] = DOC_OPTIONS.map((d) => d.slug);

export function isDocSlug(value: string): boolean {
  return DOC_SLUGS.includes(value);
}

/**
 * Reads the ?doc= value from the page link. The old value `offer` (an earlier
 * bookmark) opens the Partnership Offer. Anything unknown opens Target Audience.
 */
export function parseDocParam(value: string | string[] | null | undefined): DocKey {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === 'offer') return 'partnership-offer';
  return DOC_OPTIONS.find((d) => d.key === v)?.key ?? DEFAULT_DOC_KEY;
}

export function slugForKey(key: DocKey): DocSlug {
  return DOC_OPTIONS.find((d) => d.key === key)!.slug;
}


export const MAX_CONTENT_CHARS = 500_000;
export const MAX_VERSIONS = 50;
export const VERSION_LIST_LIMIT = 20;

export interface Section { level: 2 | 3; text: string }

// Turns the raw text of a heading into plain words for the side list:
// links become their label, bold/italic/code marks are dropped.
function plainHeading(raw: string): string {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+#+\s*$/, '')
    .trim();
}

/**
 * The H2 and H3 lines of a Markdown document, in order. Lines inside fenced
 * code blocks are ignored. The page pairs these with the rendered h2/h3
 * elements by position, so this must count exactly what the renderer counts.
 */
export function extractSections(markdown: string): Section[] {
  const out: Section[] = [];
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const f = line.match(/^ {0,3}(```+|~~~+)/);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = line.match(/^ {0,3}(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const text = plainHeading(m[2]);
    if (text) out.push({ level: m[1].length as 2 | 3, text });
  }
  return out;
}

/**
 * Which stored versions to delete so only the newest `keep` remain.
 * Newest first by saved_at; ties keep the input order.
 */
export function versionsToPrune(versions: { id: string; saved_at: string }[], keep: number = MAX_VERSIONS): string[] {
  const sorted = [...versions].sort((a, b) => (a.saved_at < b.saved_at ? 1 : a.saved_at > b.saved_at ? -1 : 0));
  return sorted.slice(keep).map((v) => v.id);
}

export type ContentCheck = { ok: true; content: string } | { ok: false; status: 400; error: string };

/** Rejects a blank or oversized save. The text itself is never trimmed or changed. */
export function checkContent(value: unknown): ContentCheck {
  if (typeof value !== 'string') return { ok: false, status: 400, error: 'content must be text' };
  if (value.trim() === '') return { ok: false, status: 400, error: 'content cannot be empty' };
  if (value.length > MAX_CONTENT_CHARS) {
    return { ok: false, status: 400, error: `content is too long (max ${MAX_CONTENT_CHARS.toLocaleString('en-US')} characters)` };
  }
  return { ok: true, content: value };
}
