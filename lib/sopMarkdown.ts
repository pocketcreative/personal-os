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

/**
 * Builds the downloadable MD for an SOP: Title, Version/System metadata,
 * the raw `content` body (Goal/Principles/Steps/Example/Checklist -- however
 * it's actually written, same as a Skill's stored markdown), then footer
 * branding (Q8). `content` is stored verbatim (migration 0025), so unlike
 * the old 5-field version this no longer synthesizes headings itself.
 */
export function renderSopExport(sop: Sop): string {
  const lines: string[] = [];
  lines.push(`# ${sop.title}`);
  lines.push('');
  lines.push(`**Version:** ${sop.version} (${sop.version_date})`);
  if (sop.systems.length > 0) lines.push(`**System:** ${sop.systems.join(', ')}`);
  lines.push('');
  lines.push(sop.content.trim() || '_Not yet written._');
  lines.push('');
  lines.push('---');
  lines.push('© Pocket Creative');
  lines.push('Brendan Ang');
  return lines.join('\n');
}

export function sopFileName(sop: Sop): string {
  const slug = sop.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled-sop';
  return `${slug}-v${sop.version}.md`;
}
