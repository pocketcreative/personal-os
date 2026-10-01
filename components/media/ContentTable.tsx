'use client';
import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShareContext } from '@/lib/shareContext';
import SharedItemFields from '@/components/shares/SharedItemFields';
import type { ContentItem } from '@/lib/types';

// Flat alternative to the Kanban board (feature 2): every item for this
// type as rows, not grouped into Stage columns. Sortable by column header,
// a small enough lift to include (per the task brief's "nice-to-have").
type SortKey = 'name' | 'stage' | 'status' | 'post_date';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Title' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'post_date', label: 'Post Date' },
];

// Reused as-is on the public /share/[token] CMS view, same treatment as
// ContentItemCard: inside the app a row still navigates to the full
// /media/item/[id] editor, but a share viewer has no login to reach that
// page, so there a row click expands the same restricted Stage/Status/
// Content editor underneath it instead (see SharedItemFields).
export default function ContentTable({ items, onUpdate }: {
  items: ContentItem[];
  onUpdate?: (id: string, patch: Partial<ContentItem>) => void;
}) {
  const router = useRouter();
  const share = useShareContext();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('post_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...items].sort((a, b) => {
    const av = (a[sortKey] ?? '') as string;
    const bv = (b[sortKey] ?? '') as string;
    const cmp = av.localeCompare(bv);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div style={{ overflowX: 'auto', border: '1px solid rgba(17,17,17,.08)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                style={{
                  textAlign: 'left', padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
                  font: "700 11.5px 'Archivo', sans-serif", color: '#111', letterSpacing: '.03em',
                  textTransform: 'uppercase', borderBottom: '1px solid rgba(17,17,17,.1)',
                  background: '#f3f1ec', whiteSpace: 'nowrap',
                }}
              >
                {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <Fragment key={item.id}>
              <tr
                onClick={() => (share ? setOpenId((cur) => (cur === item.id ? null : item.id)) : router.push(`/media/item/${item.id}`))}
                style={{ cursor: 'pointer', borderBottom: '1px solid rgba(17,17,17,.06)', background: '#fff' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(2,74,221,.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
              >
                <td style={{ padding: '10px 14px', font: "600 13px 'Inter Tight', sans-serif", color: '#111' }}>
                  {item.name}
                </td>
                <td style={{ padding: '10px 14px', font: "500 12.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.7)' }}>
                  {item.stage}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {item.status && (
                    <span style={{
                      font: "600 10px 'Inter Tight', sans-serif", letterSpacing: '.02em',
                      color: item.status === 'not started' ? 'rgba(17,17,17,.4)' : '#024ADD',
                      background: item.status === 'not started' ? 'rgba(17,17,17,.06)' : 'rgba(2,74,221,.08)',
                      padding: '2px 8px', borderRadius: 20,
                    }}>{item.status}</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', font: "500 12.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.55)' }}>
                  {item.post_date
                    ? new Date(`${item.post_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}
                </td>
              </tr>
              {share && openId === item.id && (
                <tr style={{ borderBottom: '1px solid rgba(17,17,17,.06)' }}>
                  <td colSpan={COLUMNS.length} style={{ padding: '14px', background: '#fbfaf7' }}>
                    <SharedItemFields item={item} onSave={(patch) => onUpdate?.(item.id, patch)} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} style={{ padding: '24px 14px', font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
                No items
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
