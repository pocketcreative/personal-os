import type { Sop } from '@/lib/types';

/**
 * Any em dash anywhere in an SOP's editable fields -- Brendan's standing
 * "never use an em dash in any copy" rule applies to every SOP, not just
 * text inside code blocks (that narrower, code-span-only check is
 * `codeBlockSmartCharWarning` in lib/skillFile.ts, for Skills). Advisory,
 * never blocks the save.
 */
export function sopEmDashWarning(fields: { title: string; content: string }): string | null {
  const combined = `${fields.title}\n${fields.content}`;
  if (!combined.includes('—')) return null;
  return 'This SOP has an em dash in it. Brendan\'s standing rule is no em dashes anywhere -- use a comma, period, or restructure the sentence instead.';
}

export type SopAudience = 'internal' | 'client';

// Start of a line: optional indent, optional list marker ("- ", "* ", "+ ", "1. "),
// optional bold marker, then [Internal] or [Client] and the single space after it.
const AUDIENCE_TAG = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*|__)?)\[(internal|client)\] ?/i;
const FENCE = /^\s*(```|~~~)/;

/**
 * Filters SOP markdown for one audience. Untagged lines are shared. A line
 * starting with [Internal] or [Client] is kept only for that audience, with the
 * tag removed. Fenced code blocks are never touched. Blank-line runs left
 * behind by dropped lines collapse to one blank line. Headings are never dropped.
 */
export function filterForAudience(markdown: string, audience: SopAudience): string {
  const out: string[] = [];
  let inFence = false;
  let prevBlank = false;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      out.push(line);
      prevBlank = false;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    let kept = line;
    const m = AUDIENCE_TAG.exec(line);
    if (m) {
      if (m[2].toLowerCase() !== audience) continue;
      kept = m[1] + line.slice(m[0].length);
    }
    const blank = kept.trim() === '';
    if (blank && prevBlank) continue;
    out.push(kept);
    prevBlank = blank;
  }
  return out.join('\n');
}

/**
 * Builds the downloadable MD for an SOP: Title, Version/System metadata,
 * the raw `content` body (Goal/Principles/Steps/Example/Checklist -- however
 * it's actually written, same as a Skill's stored markdown), then footer
 * branding (Q8). `content` is stored verbatim (migration 0025), so unlike
 * the old 5-field version this no longer synthesizes headings itself.
 */
export function renderSopExport(sop: Sop, audience: SopAudience): string {
  const lines: string[] = [];
  lines.push(`# ${sop.title}`);
  lines.push('');
  lines.push(`**Version:** ${sop.version} (${sop.version_date})`);
  if (sop.systems.length > 0) lines.push(`**System:** ${sop.systems.join(', ')}`);
  lines.push('');
  lines.push(filterForAudience(sop.content.trim(), audience) || '_Not yet written._');
  lines.push('');
  lines.push('---');
  lines.push('© Pocket Creative');
  lines.push('Brendan Ang');
  return lines.join('\n');
}

export function sopFileName(sop: Sop, audience?: SopAudience): string {
  const slug = sop.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled-sop';
  return `${slug}-v${sop.version}${audience ? `-${audience}` : ''}.md`;
}
