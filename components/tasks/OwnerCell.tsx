'use client';
import { useState } from 'react';
import FieldPopover from './FieldPopover';
import { KNOWN_OWNERS, OWNER_LABELS } from '@/lib/types';

// '' (blank) means Brendan — shown as nothing, not the word "Brendan", so
// the column/chip stays quiet except when it's actually telling you
// something (a named teammate, or "ai"). Shared by desktop + mobile boards
// so both stay in sync on what a given owner value displays as.
export function ownerCellLabel(owner: string | undefined): string {
  if (!owner) return '';
  return OWNER_LABELS[owner] ?? (owner.charAt(0).toUpperCase() + owner.slice(1));
}
// The popover OPTION for the blank value still needs a real label so
// Brendan knows what selecting it means — that's "Brendan", not blank text.
export function ownerOptionLabel(owner: string): string {
  return OWNER_LABELS[owner] ?? (owner.charAt(0).toUpperCase() + owner.slice(1));
}

/**
 * Direct inline text editing for the Owner field, on top of the same
 * click-to-open display/edit toggle used elsewhere in this app (see
 * AddTaskInput: a plain span until clicked, then a real `<input>`).
 *
 * Clicking anywhere in the cell swaps the label for a free-text input —
 * any name can be typed and committed, not just the two quick-pick options
 * — auto-focused with its text selected so retyping a wrong name is a
 * single motion. Enter blurs (commits via onBlur); Escape backs out
 * without saving, mirroring AddTaskInput's own Escape handling. A small
 * "▾" next to the label keeps the old one-click Brendan/AI shortcut alive
 * for the common case, without requiring typing at all.
 */
export default function OwnerCell({ owner, onChange, textStyle, empty, containerStyle, fullWidth = true }: {
  owner: string;
  onChange: (value: string) => void;
  textStyle: React.CSSProperties;
  // Rendered in place of the label when the cell is blank and not being
  // edited — desktop wants nothing there, mobile wants a faint "+ owner"
  // placeholder so the (now always-mounted) chip still has something to
  // tap.
  empty?: React.ReactNode;
  // Extra styling merged onto the display-mode container — desktop leaves
  // this off (bare text in a grid cell), mobile passes the pill
  // background/padding it used to put on the FieldPopover trigger directly.
  containerStyle?: React.CSSProperties;
  // Desktop's cell is a fixed-width grid column, so the input/container
  // should fill it (`width: 100%`, the old behaviour). Mobile's chip sits
  // in a wrapping flex row where a 100%-width item would force every chip
  // onto its own line, so it opts out and sizes to content instead.
  fullWidth?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== owner) onChange(trimmed);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="Owner…"
        style={{
          width: fullWidth ? '100%' : 90, boxSizing: 'border-box', minWidth: 0,
          font: "600 12px 'Inter Tight', sans-serif", color: '#111',
          border: '1px solid rgba(154,122,46,.4)', borderRadius: 5,
          padding: '3px 6px', background: '#fff',
        }}
      />
    );
  }

  const label = ownerCellLabel(owner);
  return (
    <div
      onClick={(e) => { e.stopPropagation(); setDraft(owner); setEditing(true); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, cursor: 'text', minHeight: 18,
        width: fullWidth ? '100%' : undefined,
        ...containerStyle,
      }}
    >
      <span style={textStyle}>{label || empty || ''}</span>
      <FieldPopover
        trigger={
          <span
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 8, color: 'rgba(17,17,17,.3)', lineHeight: 1 }}
          >▾</span>
        }
        options={KNOWN_OWNERS.map((o) => ({
          label: ownerOptionLabel(o), onSelect: () => onChange(o),
        }))}
      />
    </div>
  );
}
