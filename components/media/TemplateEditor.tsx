'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useContentTemplate } from '@/lib/useContentTemplate';
import { CONTENT_ITEM_TYPE_LABELS, type ContentItemType } from '@/lib/types';

// Client-only (ProseMirror needs the DOM), same code-split pattern as ItemDetail.
const MarkdownEditor = dynamic(() => import('@/components/skills/MarkdownEditor'), {
  ssr: false,
  loading: () => <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '10px 0' }}>Loading editor…</div>,
});

// Decision 5: templates must be editable in-app, not fixed in code. One
// continuous markdown document (migration 0035, corrected from an array of
// separate section boxes) -- Brendan adds/removes/reorders sections by
// editing the `## Heading` lines directly in the markdown itself, no
// separate add/reorder/remove-row UI needed for that any more.
export default function TemplateEditor({ type }: { type: ContentItemType }) {
  const { template, loading, saveTemplate } = useContentTemplate(type);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => { if (template) setDraft(template.template_md); }, [template]);

  async function save() {
    setSaving(true);
    const ok = await saveTemplate(draft);
    setSaving(false);
    setSaveMsg(ok ? 'Saved.' : 'Save failed, try again.');
    setTimeout(() => setSaveMsg(null), 2000);
  }

  return (
    <div style={{ width: '96%', maxWidth: 900, margin: '0 auto', padding: 'clamp(16px, 6vw, 40px) 0' }}>
      <Link href={`/media/${type}`} style={{ font: "600 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', textDecoration: 'none' }}>
        ← Back to {CONTENT_ITEM_TYPE_LABELS[type]}
      </Link>
      <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, boxShadow: '0 2px 18px rgba(0,0,0,.05)', marginTop: 12, padding: 28 }}>
        <div style={{ font: "800 18px 'Archivo', sans-serif", color: '#111', marginBottom: 4 }}>
          {CONTENT_ITEM_TYPE_LABELS[type]} Template
        </div>
        <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', marginBottom: 20 }}>
          Every new {CONTENT_ITEM_TYPE_LABELS[type]} item starts as a copy of this document. Add or remove a section by adding or removing a heading line.
        </div>

        {loading ? (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
        ) : (
          <>
            <div style={{ border: '1px solid rgba(17,17,17,.1)', borderRadius: 8, background: '#fff', padding: '4px 12px', marginBottom: 20 }}>
              <MarkdownEditor value={draft} onChange={setDraft} breaks />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={save} disabled={saving} style={{ font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#111', border: 'none', borderRadius: 7, padding: '10px 22px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save Template'}
              </button>
              {saveMsg && <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: saveMsg.startsWith('Saved') ? '#3a9d5d' : '#b3261e' }}>{saveMsg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
