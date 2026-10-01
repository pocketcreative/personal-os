'use client';
import { useEffect, useState } from 'react';
import MarkdownContent from '@/components/skills/MarkdownContent';
import { STAGE_OPTIONS, STATUS_OPTIONS, type ContentItem, type ContentItemType } from '@/lib/types';

// The one edit surface a public /share/[token] CMS link is allowed: Stage,
// Status, and the item's Content -- exactly the fields
// app/api/share/[token]/content-items/[id]/route.ts will actually save.
// Reused from both ContentItemCard/ContentTable's inline expand (board/table
// views) and nowhere else -- there's no separate full item-detail page on
// the shared view, since that page carries fields (post date/time,
// platforms, raw footage, Zernio status, Delete) this link was deliberately
// never given write access to.
export default function SharedItemFields({ item, onSave }: {
  item: ContentItem;
  onSave: (patch: Partial<Pick<ContentItem, 'body_md' | 'stage' | 'status'>>) => void;
}) {
  const [bodyDraft, setBodyDraft] = useState(item.body_md);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  useEffect(() => { setBodyDraft(item.body_md); }, [item.id, item.body_md]);

  async function save(patch: Partial<Pick<ContentItem, 'body_md' | 'stage' | 'status'>>) {
    setSaving(true);
    setSaveMsg(null);
    try {
      await onSave(patch);
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(null), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ flex: '1 1 140px' }}>
          <span style={fieldLabel}>Stage</span>
          <select value={item.stage} onChange={(e) => save({ stage: e.target.value })} style={fieldStyle}>
            {STAGE_OPTIONS[item.type as ContentItemType].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ flex: '1 1 140px' }}>
          <span style={fieldLabel}>Status</span>
          <select value={item.status ?? ''} onChange={(e) => save({ status: e.target.value })} style={fieldStyle}>
            {STATUS_OPTIONS[item.type as ContentItemType].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <span style={fieldLabel}>Content</span>
      <textarea
        value={bodyDraft}
        onChange={(e) => setBodyDraft(e.target.value)}
        onBlur={() => { if (bodyDraft !== item.body_md) save({ body_md: bodyDraft }); }}
        rows={12}
        style={{ ...fieldStyle, resize: 'vertical', fontFamily: "'Inter Tight', sans-serif", lineHeight: 1.6 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, minHeight: 18 }}>
        {saving && <span style={muted}>Saving…</span>}
        {saveMsg && <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: '#3a9d5d' }}>{saveMsg}</span>}
      </div>
      {bodyDraft.trim() && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(17,17,17,.1)' }}>
          <div style={{ ...fieldLabel, marginBottom: 8, display: 'block' }}>Preview</div>
          <MarkdownContent content={bodyDraft} breaks />
        </div>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.5)',
  letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
};
const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid rgba(17,17,17,.1)',
  borderRadius: 6, background: '#fff', boxSizing: 'border-box',
  fontFamily: "'Inter Tight', sans-serif", fontSize: 14, color: '#111', outline: 'none',
};
const muted: React.CSSProperties = { font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' };
