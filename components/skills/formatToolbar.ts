import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx';
import { callCommand } from '@milkdown/kit/utils';
import { tooltipFactory, TooltipProvider } from '@milkdown/kit/plugin/tooltip';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import styles from './FormatToolbar.module.css';

// A Notion-style bubble toolbar: appears above the selection when text is
// highlighted, hidden otherwise. Built on Milkdown's own low-level tooltip
// primitive (`tooltipFactory` + `TooltipProvider`, both real exports of
// @milkdown/plugin-tooltip re-exported at @milkdown/kit/plugin/tooltip at
// the pinned 7.22.2 version) -- the same primitive Milkdown's own shipped
// link-tooltip component is built from. There is no ready-made "formatting
// toolbar" component in @milkdown/kit at this version, so this wires the
// buttons to real commonmark preset commands directly.

const formatTooltip = tooltipFactory('FORMAT_TOOLBAR');

type ButtonSpec = { label: string; title: string; run: (ctx: Ctx) => boolean };

// Each `run` wraps `callCommand` in a function rather than calling it
// eagerly. `.key` on a $Command is only assigned once that command's own
// plugin has actually run inside a live Editor -- eagerly reading it here
// (module load time, before any Editor exists) captures `undefined` and
// throws "Cannot read properties of undefined (reading 'id')" on click.
// Deferring the read to click time, once the editor is mounted, is required.
const buttons: ButtonSpec[] = [
  { label: 'B', title: 'Bold', run: (ctx) => callCommand(toggleStrongCommand.key)(ctx) },
  { label: 'I', title: 'Italic', run: (ctx) => callCommand(toggleEmphasisCommand.key)(ctx) },
  {
    label: 'H1',
    title: 'Heading 1',
    run: (ctx) => callCommand(wrapInHeadingCommand.key, 1)(ctx),
  },
  {
    label: 'H2',
    title: 'Heading 2',
    run: (ctx) => callCommand(wrapInHeadingCommand.key, 2)(ctx),
  },
  {
    label: 'H3',
    title: 'Heading 3',
    run: (ctx) => callCommand(wrapInHeadingCommand.key, 3)(ctx),
  },
  {
    label: '•',
    title: 'Bullet list',
    run: (ctx) => callCommand(wrapInBulletListCommand.key)(ctx),
  },
  {
    label: '1.',
    title: 'Numbered list',
    run: (ctx) => callCommand(wrapInOrderedListCommand.key)(ctx),
  },
];

function buildContent(ctx: Ctx): HTMLElement {
  const el = document.createElement('div');
  el.className = styles.toolbar;
  for (const btn of buttons) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = btn.label;
    b.title = btn.title;
    b.className = styles.button;
    if (btn.label.startsWith('H')) b.classList.add(styles.headingButton);
    // mousedown, not click: preventDefault so the editor's text selection
    // (which the command needs) isn't lost to a focus change first.
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      btn.run(ctx);
    });
    el.appendChild(b);
  }
  return el;
}

export function configureFormatToolbar(ctx: Ctx) {
  const content = buildContent(ctx);
  let provider: TooltipProvider | undefined;

  ctx.set(formatTooltip.key, {
    view: () => {
      provider = new TooltipProvider({ content, root: document.body, offset: 8 });
      return {
        update: (updatedView, prevState) => provider?.update(updatedView, prevState),
        destroy: () => {
          provider?.destroy();
          content.remove();
        },
      };
    },
  });
}

export const formatToolbarPlugin: MilkdownPlugin[] = formatTooltip;
