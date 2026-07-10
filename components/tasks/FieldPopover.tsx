'use client';
import { useState } from 'react';

interface PopoverOption {
  label: string;
  onSelect: () => void;
}

/**
 * Click-to-open, click-outside-to-close, single-select popover — used for
 * every inline Category/Status/Priority field on both desktop and mobile.
 * A full-screen invisible overlay (position:fixed, inset:0) behind the
 * popover catches outside clicks; the popover itself stops propagation so
 * clicking inside doesn't immediately close it (matches the design
 * handoff's stopClick/closeAllPopovers pattern exactly).
 */
export default function FieldPopover({ trigger, options, align = 'left' }: {
  trigger: React.ReactNode;
  options: PopoverOption[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div
            onClick={(e) => e.stopPropagation()}
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
                onClick={() => { opt.onSelect(); setOpen(false); }}
                style={{
                  padding: '8px 10px', borderRadius: 5, cursor: 'pointer',
                  font: "500 13px 'Inter Tight', sans-serif", color: '#111',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
