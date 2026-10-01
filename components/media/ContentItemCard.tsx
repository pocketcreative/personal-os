'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShareContext } from '@/lib/shareContext';
import SharedItemFields from '@/components/shares/SharedItemFields';
import type { ContentItem } from '@/lib/types';

// Same visual language as components/tasks/TaskCard: white card, subtle
// border, Inter Tight body, gold accent for anything needing attention.
//
// Reused as-is on the public /share/[token] CMS view: inside the app it
// still navigates to the full /media/item/[id] editor on click, but a share
// viewer has no login to reach that page, so there a click expands the same
// restricted Stage/Status/Content editor the shared CMS was already built
// with (see SharedItemFields), right on the card, via `onUpdate` -- the same
// updateItem the board around it already calls, so the card reflects the
// save immediately without a reload.
export default function ContentItemCard({ item, onUpdate }: {
  item: ContentItem;
  onUpdate?: (id: string, patch: Partial<ContentItem>) => void;
}) {
  const router = useRouter();
  const share = useShareContext();
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => (share ? setOpen((o) => !o) : router.push(`/media/item/${item.id}`))}
      style={{
        background: '#fff', border: '1px solid rgba(17,17,17,.1)', borderRadius: 8,
        padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ font: "600 13.5px 'Inter Tight', sans-serif", color: '#111', lineHeight: 1.35 }}>
        {item.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {item.status && (
          <span style={{
            font: "600 10px 'Inter Tight', sans-serif", letterSpacing: '.02em',
            color: item.status === 'not started' ? 'rgba(17,17,17,.4)' : '#024ADD',
            background: item.status === 'not started' ? 'rgba(17,17,17,.06)' : 'rgba(2,74,221,.08)',
            padding: '2px 8px', borderRadius: 20,
          }}>{item.status}</span>
        )}
        {item.post_date && (
          <span style={{ font: "500 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.45)' }}>
            {new Date(`${item.post_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {item.unresolved_comment_count > 0 && (
          <span style={{ font: "600 10px 'Inter Tight', sans-serif", color: '#9a7a2e' }}>
            {`⚠️ ${item.unresolved_comment_count}`}
          </span>
        )}
        {item.zernio_post_ids.some((r) => r.status === 'scheduled') && (
          <span title="Scheduled via Zernio" style={{ font: "600 10px 'Inter Tight', sans-serif", color: '#3a9d5d' }}>
            ↗ Zernio
          </span>
        )}
        {item.zernio_post_ids.some((r) => r.status === 'failed' || r.status === 'not_configured') && (
          <span title="Zernio scheduling needs attention -- open the item" style={{ font: "600 10px 'Inter Tight', sans-serif", color: '#b3261e' }}>
            ⚠ Zernio
          </span>
        )}
      </div>
      {share && open && (
        <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid rgba(17,17,17,.08)' }}>
          <SharedItemFields item={item} onSave={(patch) => onUpdate?.(item.id, patch)} />
        </div>
      )}
    </div>
  );
}
