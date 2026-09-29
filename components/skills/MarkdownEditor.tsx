'use client';
import { useEffect, useRef, useState } from 'react';
import { defaultValueCtx, Editor, editorViewOptionsCtx, remarkStringifyOptionsCtx, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { getMarkdown } from '@milkdown/kit/utils';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { splitFrontmatter } from '@/lib/frontmatter';
import { configureFormatToolbar, formatToolbarPlugin } from './formatToolbar';
import styles from './MarkdownEditor.module.css';

// Live-formatting (Notion-style) markdown editor for Skills and SOPs.
// The parent's `draft` string stays the only source of truth: this reads it
// once on mount and reports every change back through onChange.
//
// Fidelity rules, from testing all 92 real skills/SOPs before shipping:
//  - Frontmatter never goes into Milkdown (it would turn `---` into a rule
//    and the YAML into a heading). It is split off, kept byte for byte, and
//    shown in its own small plain-text box.
//  - Milkdown re-writes the body in its own house style once you edit
//    (escapes like `\[`, re-padded tables, a blank line before lists). The
//    meaning is identical, but the bytes are not, so nothing is reported
//    until the text actually changes, and if an edit is undone back to the
//    starting point the original bytes are handed back, not Milkdown's copy.
//  - The serializer is pinned to this vault's own style (`-` bullets,
//    `---` rules, `**bold**`, backtick fences) to keep that re-write small.

type Props = { value: string; onChange: (next: string) => void };

function Inner({ value, onChange }: Props) {
  // Read once: after mount the editor owns the text, `value` only flows out.
  const [initial] = useState(() => splitFrontmatter(value));
  const header = useRef(initial.header);
  const body = useRef(initial.body);
  const baseline = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initial.body);
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Content (formats as you type)' },
        }));
        ctx.update(remarkStringifyOptionsCtx, (o) => ({
          ...o, bullet: '-' as const, rule: '-' as const, listItemIndent: 'one' as const,
          emphasis: '*' as const, strong: '*' as const, fence: '`' as const,
        }));
        ctx.get(listenerCtx)
          .mounted((c) => { baseline.current = getMarkdown()(c); })
          .markdownUpdated((_c, md) => {
            if (baseline.current === null) return;
            body.current = md === baseline.current ? initial.body : md;
            onChangeRef.current(header.current + body.current);
          });
        configureFormatToolbar(ctx);
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(formatToolbarPlugin),
  []);

  return (
    <div className={styles.wrap}>
      {initial.header && (
        <label className={styles.headerBox}>
          <span className={styles.headerLabel}>File header (name and trigger description)</span>
          <textarea
            defaultValue={initial.header.trimEnd()}
            spellCheck={false}
            rows={Math.min(8, initial.header.trimEnd().split('\n').length + 1)}
            onChange={(e) => {
              // Keep whatever blank-line gap the file originally had.
              const gap = initial.header.slice(initial.header.trimEnd().length) || '\n\n';
              header.current = e.target.value + gap;
              onChangeRef.current(header.current + body.current);
            }}
          />
        </label>
      )}
      <div className={styles.editor}>
        <Milkdown />
      </div>
    </div>
  );
}

export default function MarkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <Inner {...props} />
    </MilkdownProvider>
  );
}
