// Splits a SKILL.md-style file into its YAML frontmatter block (plus the
// blank lines after it) and the markdown body, byte for byte, so that
// `header + body === content` always holds.
//
// Why this exists: the Milkdown editor treats `---` as a horizontal rule
// and turns `name: x\n---` into a heading, so a whole file fed into it
// comes back with the frontmatter destroyed. The editor only ever sees the
// body; the header is kept verbatim and stuck back on in front.
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)*/;

export function splitFrontmatter(content: string): { header: string; body: string } {
  const header = content.match(FRONTMATTER)?.[0] ?? '';
  return { header, body: content.slice(header.length) };
}
