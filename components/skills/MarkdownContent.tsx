'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

// Renders a Skill/SOP's stored markdown as an actual formatted document
// instead of a raw monospace dump. Headers use Archivo (this app's existing
// heading font, matching SkillDetail/SopDetail's own page titles) at
// descending weight/size; body copy uses Inter Tight (the app's standing
// body font); code (inline and fenced) is the only thing that stays
// monospace, scoped to a code-block look rather than the whole document.
// Read-only view only -- edit mode still uses a raw textarea (see
// SkillDetail/SopDetail), this component never round-trips content.

const HEADING: React.CSSProperties = {
  fontFamily: "var(--font-archivo), 'Archivo', sans-serif",
  color: '#111',
  letterSpacing: '-0.01em',
};
const BODY: React.CSSProperties = {
  fontFamily: "var(--font-inter-tight), 'Inter Tight', sans-serif",
  color: 'rgba(17,17,17,.85)',
};
const MONO = { fontFamily: 'ui-monospace, Menlo, monospace' };

const components: Components = {
  h1: ({ children }) => (
    <h1 style={{ ...HEADING, fontWeight: 800, fontSize: 22, margin: '4px 0 14px', lineHeight: 1.25 }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{
      ...HEADING, fontWeight: 800, fontSize: 18, margin: '30px 0 12px',
      paddingBottom: 8, borderBottom: '1px solid rgba(17,17,17,.1)', lineHeight: 1.3,
    }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ ...HEADING, fontWeight: 700, fontSize: 15.5, margin: '22px 0 8px', lineHeight: 1.35 }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ ...BODY, fontWeight: 700, fontSize: 13.5, margin: '16px 0 6px' }}>{children}</h4>
  ),
  p: ({ children }) => (
    <p style={{ ...BODY, fontWeight: 500, fontSize: 14, lineHeight: 1.75, margin: '0 0 14px' }}>{children}</p>
  ),
  strong: ({ children }) => <strong style={{ fontWeight: 700, color: '#111' }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#024ADD', textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul style={{ ...BODY, fontWeight: 500, fontSize: 14, lineHeight: 1.75, margin: '0 0 14px', paddingLeft: 22, listStyleType: 'disc' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ ...BODY, fontWeight: 500, fontSize: 14, lineHeight: 1.75, margin: '0 0 14px', paddingLeft: 22, listStyleType: 'decimal' }}>{children}</ol>
  ),
  li: ({ children, ...props }) => {
    // GFM task-list items (- [ ] / - [x]) come through with a `checked` prop
    // and lose their default bullet so the checkbox reads as the marker.
    const checked = (props as { checked?: boolean | null }).checked;
    if (checked !== null && checked !== undefined) {
      return (
        <li style={{ listStyle: 'none', marginLeft: -22, marginBottom: 6 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={checked} readOnly disabled style={{ marginTop: 4, accentColor: '#024ADD' }} />
            <span style={{ opacity: checked ? 0.55 : 1, textDecoration: checked ? 'line-through' : 'none' }}>{children}</span>
          </label>
        </li>
      );
    }
    return <li style={{ marginBottom: 6 }}>{children}</li>;
  },
  blockquote: ({ children }) => (
    <blockquote style={{
      margin: '0 0 14px', padding: '8px 16px', background: 'rgba(17,17,17,.03)', borderRadius: 6,
      color: 'rgba(17,17,17,.62)', fontStyle: 'italic',
    }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(17,17,17,.1)', margin: '24px 0' }} />,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? '');
    if (!isBlock) {
      return (
        <code
          style={{
            ...MONO, fontSize: 12.5, background: 'rgba(2,74,221,.07)', color: '#0a2f8f',
            padding: '1px 5px', borderRadius: 4,
          }}
          {...props}
        >
          {children}
        </code>
      );
    }
    return <code className={className} style={{ ...MONO, fontSize: 12.5, lineHeight: 1.6 }} {...props}>{children}</code>;
  },
  pre: ({ children }) => (
    <pre style={{
      ...MONO, fontSize: 12.5, lineHeight: 1.6, color: '#111', background: '#f4f3ef',
      border: '1px solid rgba(17,17,17,.1)', borderRadius: 8, padding: '14px 16px',
      overflowX: 'auto', margin: '0 0 16px', WebkitOverflowScrolling: 'touch',
    }}>
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 16px', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ ...BODY, fontSize: 13, borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ textAlign: 'left', fontWeight: 700, padding: '8px 12px', borderBottom: '2px solid rgba(17,17,17,.15)', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ padding: '8px 12px', borderBottom: '1px solid rgba(17,17,17,.08)', verticalAlign: 'top' }}>{children}</td>
  ),
};

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <div style={{ width: '100%', wordBreak: 'break-word' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
