'use client';
import { useEffect, useRef, useState } from 'react';

interface PopoverOption {
  label: string;
  onSelect: () => void;
}

/**
 * Click-to-open, click-outside-to-close, single-select popover — used for
 * every inline Category/Status/Priority field on both desktop and mobile.
 *
 * Outside-close used to be a full-screen overlay div with its own onClick,
 * inserted the instant the popover opened. That's fine for a real mouse
 * click (one atomic event), but a single tap on a touch device fires a
 * *sequence* of synthesized events (touchstart, touchend, mouseover,
 * mousedown, mouseup, click) — the overlay could land in the DOM in time to
 * catch a LATER event from that same opening tap and instantly close
 * itself, so the popover never appeared to open at all. Fixed by deferring
 * the outside-close listener by one tick (past the opening gesture) and
 * detecting "outside" via a ref instead of a covering div.
 */
export default function FieldPopover({ trigger, options, align = 'left', closeOnSelect = true }: {
  trigger: React.ReactNode;
  options: PopoverOption[];
  align?: 'left' | 'right';
  // false for multi-select pickers (e.g. a day-of-week toggle list) where
  // each tap should register without dismissing the popover — the user
  // closes it themselves by tapping outside once they're done.
  closeOnSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener('pointerdown', closeIfOutside), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', closeIfOutside);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      {open && (
        <div
          style={{
            position: 'absolute', top: 32, [align]: 0, zIndex: 60,
            background: '#fff', border: '1px solid rgba(17,17,17,.12)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            padding: 6, display: 'flex', flexDirection: 'column', gap: 1,
            minWidth: 150,
          }}
        >
          {options.map((opt) => (
            <div
              key={opt.label}
              onClick={() => { opt.onSelect(); if (closeOnSelect) setOpen(false); }}
              style={{
                padding: '8px 10px', borderRadius: 5, cursor: 'pointer',
                font: "500 13px 'Inter Tight', sans-serif", color: '#111',
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
