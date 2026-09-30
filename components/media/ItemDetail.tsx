'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useContentItems } from '@/lib/useContentItems';
import { useContentItemComments } from '@/lib/useContentItemComments';
import { driveViewUrl, streamSrc } from '@/lib/driveVideo';
import {
  CONFLICT_WINDOW_MINUTES, CONTENT_ITEM_TYPE_LABELS, STAGE_OPTIONS, STATUS_OPTIONS,
  itemScheduledTime, timeToMinutes, type ContentItem,
} from '@/lib/types';

// Client-only (ProseMirror needs the DOM), same code-split pattern as
// SkillDetail.tsx.
const MarkdownEditor = dynamic(() => import('@/components/skills/MarkdownEditor'), {
  ssr: false,
  loading: () => <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '10px 0' }}>Loading editor…</div>,
});

const AUTOSAVE_DELAY_MS = 2000; // matches SkillDetail's autosave debounce

const labelStyle = {
  font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.5)',
  letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 8, display: 'block',
};
const fieldStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid rgba(17,17,17,.1)',
  borderRadius: 6, background: '#fff', boxSizing: 'border-box' as const,
  fontFamily: "'Inter Tight', sans-serif", fontSize: 14, color: '#111', outline: 'none',
};

function ZernioBadge({ item }: { item: ContentItem }) {
  if (item.zernio_post_ids.length === 0) return null;
  return (
    <div style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: 'rgba(2,74,221,.05)', border: '1px solid rgba(2,74,221,.15)' }}>
      <div style={{ ...labelStyle, marginBottom: 6 }}>Zernio Scheduling</div>
      {item.zernio_post_ids.map((r, i) => (
        <div key={i} style={{ font: "500 12px 'Inter Tight', sans-serif", color: r.status === 'scheduled' ? '#3a9d5d' : r.status === 'failed' ? '#b3261e' : 'rgba(17,17,17,.5)', marginBottom: 2 }}>
          {r.platform}: {r.status}{r.scheduled_for ? ` — ${new Date(r.scheduled_for).toLocaleString()}` : ''}{r.error ? ` (${r.error})` : ''}
        </div>
      ))}
    </div>
  );
}

export default function ItemDetail({ id }: { id: string }) {
  const router = useRouter();
  const { items, loading, updateItem, deleteItem } = useContentItems();
  const item = items.find((i) => i.id === id) ?? null;

  if (loading) return <div style={{ padding: 40, font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>;
  if (!item) return <div style={{ padding: 40, font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Item not found. <Link href="/media">Back to Calendar</Link></div>;

  return <ItemDetailInner item={item} allItems={items} onUpdate={updateItem} onDelete={async () => { await deleteItem(item.id); router.push(`/media/${item.type}`); }} />;
}

function ItemDetailInner({ item, allItems, onUpdate, onDelete }: {
  item: ContentItem;
  allItems: ContentItem[];
  onUpdate: (id: string, patch: Partial<ContentItem>) => Promise<ContentItem | null>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [bodyDraft, setBodyDraft] = useState(item.body_md);
  // Local draft, saved only on blur -- NOT a controlled value+onChange save
  // like the other fields on this page. A native <input type="time"> fires
  // onChange once per keystroke on each segment (hour/minute/AM-PM), and each
  // of those was firing its own PATCH; typing fast enough sent overlapping
  // requests that could resolve out of order and leave post_time stuck at
  // null even though the field visually showed the typed time. Confirmed live
  // on production 2026-09-30: typed 09:00, the field displayed 9:00 AM and
  // the conflict warning appeared, but a direct DB check showed post_time
  // had actually landed as null. Save-on-blur (one request, after typing is
  // done) removes the race entirely.
  const [timeDraft, setTimeDraft] = useState(item.post_time ? item.post_time.slice(0, 5) : '');
  useEffect(() => { setTimeDraft(item.post_time ? item.post_time.slice(0, 5) : ''); }, [item.id, item.post_time]);
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('details');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setBodyDraft(item.body_md); }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { comments, loading: commentsLoading, addComment, setResolved, deleteComment } = useContentItemComments(item.id);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentTs, setCommentTs] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  function bodyChanged(text: string) {
    setBodyDraft(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await onUpdate(item.id, { body_md: text });
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(null), 1500);
    }, AUTOSAVE_DELAY_MS);
  }

  async function saveField(patch: Partial<ContentItem>) {
    await onUpdate(item.id, patch);
  }

  async function submitComment() {
    const body = commentDraft.trim();
    if (!body || postingComment) return;
    setPostingComment(true);
    const seconds = commentTs.trim() ? Number(commentTs.trim()) : null;
    const ok = await addComment(body, Number.isFinite(seconds) ? seconds : null);
    setPostingComment(false);
    if (ok) { setCommentDraft(''); setCommentTs(''); }
  }

  const rawFootageIsVideo = item.type === 'lts' && !!item.raw_footage && /\/file\/d\//.test(item.raw_footage);

  // Same-day-same-time conflict check (the real thing Brendan's trying to
  // catch: two items posting within minutes of each other). Only meaningful
  // once this item has both a date and a time set.
  const myMinutes = timeToMinutes(item.post_time);
  const conflicts = item.post_date && myMinutes != null
    ? allItems.filter((other) => {
        if (other.id === item.id || other.post_date !== item.post_date) return false;
        const otherMinutes = timeToMinutes(other.post_time);
        return otherMinutes != null && Math.abs(otherMinutes - myMinutes) <= CONFLICT_WINDOW_MINUTES;
      })
    : [];

  return (
    <div style={{ width: '96%', maxWidth: 1100, margin: '0 auto', padding: 'clamp(16px, 6vw, 40px) 0' }}>
      <Link href={`/media/${item.type}`} style={{ font: "600 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', textDecoration: 'none' }}>
        ← Back to {CONTENT_ITEM_TYPE_LABELS[item.type]}
      </Link>

      <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, boxShadow: '0 2px 18px rgba(0,0,0,.05)', marginTop: 12 }}>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid rgba(17,17,17,.08)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (name.trim() && name !== item.name) saveField({ name: name.trim() }); }}
            style={{ flex: 1, font: "700 20px 'Inter Tight', sans-serif", color: '#111', border: 'none', outline: 'none', background: 'transparent' }}
          />
          <Link href={`/media/templates/${item.type}`} style={{ font: "600 11px 'Inter Tight', sans-serif", color: '#024ADD', whiteSpace: 'nowrap' }}>
            Edit template
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px 28px 0' }}>
          <button onClick={() => setActiveTab('details')} style={{
            font: "700 11px 'Archivo', sans-serif", letterSpacing: '.05em', textTransform: 'uppercase',
            color: activeTab === 'details' ? '#fff' : 'rgba(17,17,17,.5)', background: activeTab === 'details' ? '#111' : 'rgba(17,17,17,.06)',
            border: 'none', borderRadius: 7, padding: '9px 16px', cursor: 'pointer',
          }}>Details</button>
          <button onClick={() => setActiveTab('comments')} style={{
            font: "700 11px 'Archivo', sans-serif", letterSpacing: '.05em', textTransform: 'uppercase',
            color: activeTab === 'comments' ? '#fff' : 'rgba(17,17,17,.5)', background: activeTab === 'comments' ? '#111' : 'rgba(17,17,17,.06)',
            border: 'none', borderRadius: 7, padding: '9px 16px', cursor: 'pointer',
          }}>{`Comments${comments.length > 0 ? ` (${comments.length})` : ''}`}</button>
          {saveMsg && <span style={{ font: "500 11px 'Inter Tight', sans-serif", color: '#3a9d5d', alignSelf: 'center' }}>{saveMsg}</span>}
        </div>

        {activeTab === 'details' ? (
          <div style={{ padding: '20px 28px 28px' }}>
            <ZernioBadge item={item} />

            {item.reference_video && /\/file\/d\//.test(item.reference_video) && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Review Video</label>
                <video ref={videoRef} src={streamSrc(item.reference_video)} controls playsInline style={{ width: '100%', maxWidth: 480, borderRadius: 8, background: '#111', display: 'block' }} />
                <a href={driveViewUrl(item.reference_video)} target="_blank" rel="noopener noreferrer" style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginTop: 6, display: 'inline-block' }}>Open in Google Drive ↗</a>
              </div>
            )}
            {rawFootageIsVideo && !item.reference_video && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Clip</label>
                <video ref={videoRef} src={streamSrc(item.raw_footage!)} controls playsInline style={{ width: '100%', maxWidth: 480, borderRadius: 8, background: '#111', display: 'block' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={labelStyle}>Stage</label>
                <select value={item.stage} onChange={(e) => saveField({ stage: e.target.value })} style={fieldStyle}>
                  {STAGE_OPTIONS[item.type].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={labelStyle}>Status</label>
                <select value={item.status ?? ''} onChange={(e) => saveField({ status: e.target.value })} style={fieldStyle}>
                  {STATUS_OPTIONS[item.type].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={labelStyle}>Post Date</label>
                <input type="date" value={item.post_date ?? ''} onChange={(e) => saveField({ post_date: e.target.value || null })} style={fieldStyle} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={labelStyle}>Post Time (SGT)</label>
                <input
                  type="time"
                  value={timeDraft}
                  onChange={(e) => setTimeDraft(e.target.value)}
                  onBlur={() => { if (timeDraft !== (item.post_time ? item.post_time.slice(0, 5) : '')) saveField({ post_time: timeDraft || null }); }}
                  style={fieldStyle}
                />
                {itemScheduledTime(item) && (
                  <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: '#024ADD', marginTop: 6 }}>
                    Posting at {itemScheduledTime(item)} SGT
                  </div>
                )}
                {conflicts.length > 0 && (
                  <div style={{ font: "700 11px 'Inter Tight', sans-serif", color: '#b3261e', marginTop: 6 }}>
                    ⚠️ Same time as: {conflicts.map((c) => c.name).join(', ')}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Platforms (comma separated -- must match a connected Zernio account, e.g. Instagram, Facebook, to actually schedule)</label>
              <input defaultValue={item.platforms.join(', ')} onBlur={(e) => saveField({ platforms: e.target.value.split(',').map((p) => p.trim()).filter(Boolean) })} style={fieldStyle} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Caption</label>
              <textarea defaultValue={item.caption ?? ''} onBlur={(e) => saveField({ caption: e.target.value || null })} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <label style={labelStyle}>Raw Footage {item.type === 'lf' ? '(Drive project folder)' : item.type === 'lts' ? '(this clip’s file)' : ''}</label>
                <input defaultValue={item.raw_footage ?? ''} onBlur={(e) => saveField({ raw_footage: e.target.value || null })} placeholder="https://…" style={fieldStyle} />
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <label style={labelStyle}>Posted Footage (live/published URL only)</label>
                <input defaultValue={item.posted_footage ?? ''} onBlur={(e) => saveField({ posted_footage: e.target.value || null })} placeholder="https://…" style={fieldStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Reference Video</label>
              <input defaultValue={item.reference_video ?? ''} onBlur={(e) => saveField({ reference_video: e.target.value || null })} placeholder="https://drive.google.com/file/d/…" style={fieldStyle} />
            </div>

            {item.type === 'lf' && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Asset Link</label>
                <input defaultValue={item.asset_link ?? ''} onBlur={(e) => saveField({ asset_link: e.target.value || null })} placeholder="https://…" style={fieldStyle} />
              </div>
            )}

            <div style={{ borderTop: '1px solid rgba(17,17,17,.08)', paddingTop: 20, marginTop: 8 }}>
              <div style={{ font: "700 13px 'Archivo', sans-serif", color: '#111', marginBottom: 14 }}>Content</div>
              <div style={{ border: '1px solid rgba(17,17,17,.1)', borderRadius: 8, background: '#fff', padding: '4px 12px' }}>
                <MarkdownEditor value={bodyDraft} onChange={bodyChanged} breaks />
              </div>
            </div>

            <button
              onClick={() => { if (confirm(`Delete "${item.name}"? This can't be undone.`)) onDelete(); }}
              style={{ font: "600 13px 'Inter Tight', sans-serif", color: '#c0392b', background: 'transparent', border: '1px solid rgba(192,57,43,.3)', borderRadius: 7, padding: '10px 18px', cursor: 'pointer', marginTop: 12 }}
            >Delete</button>
          </div>
        ) : (
          <div style={{ padding: '20px 28px 28px' }}>
            {commentsLoading ? (
              <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
            ) : comments.length === 0 ? (
              <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>No notes yet.</div>
            ) : (
              comments.map((c) => (
                <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid rgba(17,17,17,.07)', opacity: c.resolved ? 0.45 : 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ font: "600 11px 'Inter Tight', sans-serif", color: /agent|^ai$/i.test(c.author) ? '#9a7a2e' : '#111' }}>{c.author}</span>
                    {c.video_timestamp_seconds != null && (
                      <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = c.video_timestamp_seconds!; }}
                        style={{ font: "600 10px 'Inter Tight', sans-serif", color: '#9a7a2e', background: 'rgba(154,122,46,.1)', padding: '2px 7px', borderRadius: 20, border: 'none', cursor: 'pointer' }}>
                        {Math.floor(c.video_timestamp_seconds)}s
                      </button>
                    )}
                    <span style={{ flex: 1 }} />
                    <button onClick={() => setResolved(c.id, !c.resolved)} style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', background: 'none', border: 'none', cursor: 'pointer' }}>{c.resolved ? 'Reopen' : 'Resolve'}</button>
                    <button onClick={() => deleteComment(c.id)} style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(192,57,43,.55)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                  </div>
                  <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: '#111', whiteSpace: 'pre-wrap' }}>{c.body}</div>
                </div>
              ))
            )}
            <div style={{ borderTop: '1px solid rgba(17,17,17,.08)', paddingTop: 14, marginTop: 8 }}>
              <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="What needs changing…" style={{ ...fieldStyle, minHeight: 70, resize: 'vertical', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input value={commentTs} onChange={(e) => setCommentTs(e.target.value)} placeholder="Seconds (optional)" style={{ ...fieldStyle, flex: '0 0 140px', width: 140 }} />
                <span style={{ flex: 1 }} />
                <button onClick={submitComment} disabled={postingComment} style={{ font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#111', border: 'none', borderRadius: 7, padding: '10px 18px', cursor: 'pointer', opacity: postingComment ? 0.6 : 1 }}>{postingComment ? 'Posting…' : 'Comment'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
