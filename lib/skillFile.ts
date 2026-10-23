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
 * Strips the leading YAML frontmatter block (`---\n...\n---`) for display,
 * so the read-only markdown-rendered view doesn't re-show `name:`/
 * `description:` as a stray paragraph -- that content is already surfaced
 * above via readTrigger(). Returns the content unchanged if there's no
 * frontmatter block.
 */
export function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart();
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

// Version bookkeeping shared by the skill PATCH and rename routes: bumps an
// "x.y" version's minor number; a hand-typed version of any other shape is
// left as-is.
export function bumpVersion(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)$/);
  if (!m) return v;
  return `${m[1]}.${Number(m[2]) + 1}`;
}

/**
 * Returns an error message if `s` is not a usable skill folder name, else
 * null. Lowercase letters, numbers and single dashes, 2 to 64 chars.
 * 'synced' and 'node_modules' are folders under ~/.claude/skills that are not
 * skills; a leading dot would hide the folder.
 */
export function validateSlug(s: string): string | null {
  if (s.length < 2 || s.length > 64) return 'Use lowercase letters, numbers and dashes only (2 to 64).';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return 'Use lowercase letters, numbers and dashes only (2 to 64).';
  if (s === 'synced' || s === 'node_modules' || s.startsWith('.')) return 'That name is reserved.';
  return null;
}

/**
 * Rewrites only the `name:` line inside the first `---` frontmatter block.
 * Keeps quoting style and line endings, inserts a `name:` line if the block
 * has none, and returns the content unchanged if there is no frontmatter.
 */
export function renameFrontmatterName(content: string, newName: string): string {
  const m = content.match(/^(\uFEFF?)---(\r?\n)([\s\S]*?)(\r?\n)---/);
  if (!m) return content;
  // Also swallow indented continuation lines, so a folded `name: >-` value is
  // replaced whole instead of leaving its old text behind.
  const nameLine = /^name:[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/m;
  let block: string;
  if (nameLine.test(m[3])) {
    block = m[3].replace(nameLine, (line) => {
      const q = line.match(/^name:\s*(["'])/);
      return q ? `name: ${q[1]}${newName}${q[1]}` : `name: ${newName}`;
    });
  } else {
    block = `name: ${newName}${m[2]}${m[3]}`;
  }
  return `${m[1]}---${m[2]}${block}${m[4]}---${content.slice(m[0].length)}`;
}
