'use client';
import { useEffect, useRef, useState } from 'react';
import type { ContentPiece } from '@/lib/types';

export default function ContentDetailModal({ piece, onClose, onSave, onDelete }: {
  piece: ContentPiece;
  onClose: () => void;
  onSave: (patch: Partial<ContentPiece>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(piece.title);
  const [visualHook, setVisualHook] = useState(piece.visual_hook ?? '');
  const [script, setScript] = useState(piece.script ?? '');
  const [platform, setPlatform] = useState(piece.platform.join(', '));
  const [targetPostDate, setTargetPostDate] = useState(piece.target_post_date ?? '');
  const [rawFootageLink, setRawFootageLink] = useState(piece.raw_footage_link ?? '');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  function done() {
    const patch: Partial<ContentPiece> = {};
    if (title !== piece.title) patch.title = title;
    if (visualHook !== (piece.visual_hook ?? '')) patch.visual_hook = visualHook || null;
    if (script !== (piece.script ?? '')) patch.script = script || null;
    const nextPlatform = platform.split(',').map((p) => p.trim()).filter(Boolean);
    if (nextPlatform.join(',') !== piece.platform.join(',')) patch.platform = nextPlatform;
    if (targetPostDate !== (piece.target_post_date ?? '')) patch.target_post_date = targetPostDate || null;
    if (rawFootageLink !== (piece.raw_footage_link ?? '')) patch.raw_footage_link = rawFootageLink || null;
    if (Object.keys(patch).length > 0) onSave(patch);
    onClose();
  }

  const fieldStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid rgba(17,17,17,.1)',
    borderRadius: 6, background: '#fff', boxSizing: 'border-box' as const,
    fontFamily: "'Inter Tight', sans-serif", fontSize: 16, color: '#111', outline: 'none',
  };
  const labelStyle = {
    font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)',
    letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 8,
  };

  return (
    <div
      onClick={done}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,17,17,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 70, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fbfaf7', borderRadius: 12, width: 560, maxWidth: '100%',
          maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ padding: '32px 32px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <textarea
            ref={titleRef}
            value={title} onChange={(e) => setTitle(e.target.value)}
            rows={1}
            style={{
              flex: 1, font: "700 21px 'Inter Tight', sans-serif", color: '#111',
              letterSpacing: '-0.01em', padding: '4px 0', border: 'none', outline: 'none', background: 'transparent',
              resize: 'none', overflow: 'hidden',
            }}
          />
          <span onClick={done} style={{ cursor: 'pointer', color: 'rgba(17,17,17,.4)', fontSize: 18, padding: 4 }}>✕</span>
        </div>

        <div style={{ padding: '8px 32px 0' }}>
          <div style={labelStyle}>Visual Hook</div>
          <input value={visualHook} onChange={(e) => setVisualHook(e.target.value)} placeholder="The opening shot / line…" style={{ ...fieldStyle, marginBottom: 20 }} />

          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Platform</div>
              <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="IG, TikTok, YouTube…" style={fieldStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Target Post Date</div>
              <input type="date" value={targetPostDate} onChange={(e) => setTargetPostDate(e.target.value)} style={fieldStyle} />
            </div>
          </div>

          <div style={labelStyle}>Raw Footage Link</div>
          <input value={rawFootageLink} onChange={(e) => setRawFootageLink(e.target.value)} placeholder="https://…" style={{ ...fieldStyle, marginBottom: 20 }} />

          <div style={labelStyle}>Script</div>
          <textarea
            value={script} onChange={(e) => setScript(e.target.value)}
            placeholder="Full script goes here…"
            style={{ ...fieldStyle, minHeight: 200, lineHeight: 1.5, resize: 'vertical', marginBottom: 24 }}
          />
        </div>

        <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(17,17,17,.08)', display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => { if (confirm(`Delete "${piece.title}"? This can't be undone.`)) onDelete(); }}
            style={{
              font: "600 13px 'Inter Tight', sans-serif", color: '#c0392b', background: 'transparent',
              border: '1px solid rgba(192,57,43,.3)', borderRadius: 7, padding: '10px 18px', cursor: 'pointer',
            }}
          >
            Delete
          </button>
          <button
            onClick={done}
            style={{
              font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#111',
              border: 'none', borderRadius: 7, padding: '10px 22px', cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
