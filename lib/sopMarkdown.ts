import type { Sop } from '@/lib/types';

/**
 * Any em dash anywhere in an SOP's content fields -- Brendan's standing
 * "never use an em dash in any copy" rule applies to every SOP, not just
 * text inside code blocks (that narrower, code-span-only check is
 * `codeBlockSmartCharWarning` in lib/skillFile.ts, for Skills). Advisory,
 * never blocks the save.
 */
export function sopEmDashWarning(fields: {
  title: string; goal: string; principles: string; steps: string;
  example: string | null; checklist: string;
}): string | null {
  const combined = [fields.title, fields.goal, fields.principles, fields.steps, fields.example ?? '', fields.checklist].join('\n');
  if (!combined.includes('—')) return null;
  return 'This SOP has an em dash in it. Brendan\'s standing rule is no em dashes anywhere -- use a comma, period, or restructure the sentence instead.';
}

/**
 * Builds the downloadable MD for an SOP: Title, Date & Version, then the
 * 7-section body (Goal / Principles / Steps / Example / Checklist), footer
 * branding (Q8). The Example heading is left out entirely when `example`
 * is blank/null (Q9) so the exported file still looks finished, even
 * though the UI itself shows an empty Example section as a placeholder.
 */
export function renderSopExport(sop: Sop): string {
  const lines: string[] = [];
  lines.push(`# ${sop.title}`);
  lines.push('');
  lines.push(`**Version:** ${sop.version} (${sop.version_date})`);
  if (sop.systems.length > 0) lines.push(`**System:** ${sop.systems.join(', ')}`);
  lines.push('');
  lines.push('## Goal');
  lines.push(sop.goal.trim() || '_Not yet written._');
  lines.push('');
  lines.push('## Principles');
  lines.push(sop.principles.trim() || '_Not yet written._');
  lines.push('');
  lines.push('## Steps');
  lines.push(sop.steps.trim() || '_Not yet written._');
  lines.push('');
  if (sop.example && sop.example.trim()) {
    lines.push('## Example');
    lines.push(sop.example.trim());
    lines.push('');
  }
  lines.push('## Checklist');
  lines.push(sop.checklist.trim() || '_Not yet written._');
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
