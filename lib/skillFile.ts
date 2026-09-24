import { createHash } from 'node:crypto';

/**
 * sha256 of the exact bytes handed in. Used both at import time (C1: seed
 * `synced_hash` from the real local file, never leave it null for a synced
 * skill) and by scripts/sync-skills.mjs to detect local-vs-record drift.
 * Server/script only (node:crypto) -- never import this from a client
 * component.
 */
export function sha256(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

/**
 * Reads the `description:` value out of a SKILL.md's YAML frontmatter, for
 * DISPLAY only -- the trigger text is never duplicated into its own DB
 * column (that was v0.1's `trigger_description` field, removed in the
 * Skills/SOPs split so two fields don't do one job). Handles a single-line
 * value and a folded/wrapped one (continuation lines with no `key:` prefix).
 * Returns null if there's no frontmatter or no description line.
 */
export function readTrigger(content: string): string | null {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;
  const lines = fmMatch[1].split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^description:\s*/.test(l));
  if (startIdx === -1) return null;
  let value = lines[startIdx].replace(/^description:\s*/, '').trim();
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^[A-Za-z_][\w-]*:\s?/.test(lines[i]) || lines[i].trim() === '') break;
    value += ' ' + lines[i].trim();
  }
  value = value.trim().replace(/^["']|["']$/g, '');
  return value || null;
}

/**
 * 2.5.8: a skill with no trigger description in its frontmatter is still
 * imported, but flagged, and sync-skills.mjs refuses to write it back to
 * disk until it has one.
 */
export function hasTrigger(content: string): boolean {
  return readTrigger(content) !== null;
}

// M2 save warning: a curly quote or em dash landing INSIDE a code span
// (inline `code` or a fenced ```block```) is the classic sign of iPhone
// autocorrect mangling a command, file path, or CLI flag mid-edit. Warn,
// never block -- this is advisory, not a validation failure.
const SMART_CHARS = /[‘’“”—]/; // ' ' " " (em dash)

export function codeBlockSmartCharWarning(content: string): string | null {
  const spans = content.match(/```[\s\S]*?```|`[^`\n]*`/g) ?? [];
  const hit = spans.some((s) => SMART_CHARS.test(s));
  if (!hit) return null;
  return 'A curly quote or em dash showed up inside a code block or backticks in this save -- often an iPhone-keyboard autocorrect artifact. Worth checking it did not mangle a command or file path.';
}
