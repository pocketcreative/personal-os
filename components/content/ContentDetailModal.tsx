'use client';
import { useEffect, useRef, useState } from 'react';
import type { ContentComment, ContentFormat, ContentPiece } from '@/lib/types';
import { CONTENT_FORMATS, CONTENT_FORMAT_LABELS } from '@/lib/types';
import { useContentComments } from '@/lib/useContentComments';

// Accepts either "1:42" or a plain "102". Returns null for blank or
// unparseable, which is also what "no timestamp on this note" looks like in
// the database.
function parseTimestamp(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => p.trim());
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const seconds = parts.reduce((acc, p) => acc * 60 + Number(p), 0);
  return Number.isFinite(seconds) ? seconds : null;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function CommentRow({ comment, onToggleResolved, onDelete }: {
  comment: ContentComment;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  // Same gold-for-AI rule the task board uses on its owner column, so a note
  // written by an agent reads the same way in both places.
  const isAgent = /agent|^ai$/i.test(comment.author);
  return (
    <div style={{
      padding: '10px 0', borderTop: '1px solid rgba(17,17,17,.07)',
      opacity: comment.resolved ? 0.45 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{
          font: "600 11px 'Inter Tight', sans-serif",
          color: isAgent ? '#9a7a2e' : 'rgba(17,17,17,.55)',
        }}>{comment.author}</span>
        {comment.video_timestamp_seconds != null && (
          <span style={{
            font: "600 10px 'Inter Tight', sans-serif", color: '#9a7a2e',
            background: 'rgba(154,122,46,.1)', padding: '2px 7px', borderRadius: 20,
          }}>{formatTimestamp(comment.video_timestamp_seconds)}</span>
        )}
        <span style={{ font: "500 10px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.3)' }}>
          {new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <span style={{ flex: 1 }} />
        <span
          onClick={onToggleResolved}
          style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.45)', cursor: 'pointer' }}
        >{comment.resolved ? 'Reopen' : 'Resolve'}</span>
        <span
          onClick={() => { if (confirm('Delete this comment?')) onDelete(); }}
          style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(192,57,43,.55)', cursor: 'pointer' }}
        >Delete</span>
      </div>
      <div style={{
        font: "500 14px 'Inter Tight', sans-serif", color: '#111', lineHeight: 1.45, whiteSpace: 'pre-wrap',
      }}>{comment.body}</div>
    </div>
  );
}

// The review loop. Notes left here are what the next reel-editor / reel-cutter
// pass gets briefed from, and any unresolved one is what puts the "Needs
// re-edit" badge on the card.
function CommentsPanel({ pieceId, onCountsChange, labelStyle, fieldStyle }: {
  pieceId: string;
  onCountsChange?: (total: number, unresolved: number) => void;
  labelStyle: React.CSSProperties;
  fieldStyle: React.CSSProperties;
}) {
  const { comments, loading, addComment, setResolved, deleteComment } = useContentComments(pieceId, onCountsChange);
  const [draft, setDraft] = useState('');
  const [ts, setTs] = useState('');
  const unresolved = comments.filter((c) => !c.resolved).length;

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    addComment(body, parseTimestamp(ts));
    setDraft('');
    setTs('');
  };

  return (
    <div className="comments-panel" style={{ padding: 20 }}>
      <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: '0 0 auto' }}>
        Comments
        <span style={{ color: 'rgba(17,17,17,.3)' }}>{comments.length}</span>
        {unresolved > 0 && (
          <span style={{ color: '#9a7a2e' }}>{`⚠️ ${unresolved} needs re-edit`}</span>
        )}
      </div>

      <div className="comments-panel-list" style={{ marginTop: 6 }}>
        {loading ? (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.35)', padding: '6px 0 12px' }}>
            Loading…
          </div>
        ) : comments.length === 0 ? (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.35)', padding: '6px 0 12px' }}>
            No notes on this one yet.
          </div>
        ) : (
          <div>
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                onToggleResolved={() => setResolved(c.id, !c.resolved)}
                onDelete={() => deleteComment(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: '0 0 auto', borderTop: '1px solid rgba(17,17,17,.08)', paddingTop: 14, marginTop: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What needs changing…"
          style={{ ...fieldStyle, minHeight: 70, lineHeight: 1.45, resize: 'vertical', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={ts}
            onChange={(e) => setTs(e.target.value)}
            placeholder="0:42 (optional)"
            style={{ ...fieldStyle, flex: '0 0 120px', width: 120 }}
          />
          <span style={{ flex: 1 }} />
          <button
            onClick={submit}
            style={{
              font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#111',
              border: 'none', borderRadius: 7, padding: '10px 18px', cursor: 'pointer',
            }}
          >Comment</button>
        </div>
      </div>
    </div>
  );
}

export default function ContentDetailModal({ piece, onClose, onSave, onDelete, onCommentCountsChange }: {
  piece: ContentPiece;
  onClose: () => void;
  onSave: (patch: Partial<ContentPiece>) => void;
  onDelete: () => void;
  onCommentCountsChange?: (total: number, unresolved: number) => void;
}) {
  const [title, setTitle] = useState(piece.title);
  const [visualHook, setVisualHook] = useState(piece.visual_hook ?? '');
  const [script, setScript] = useState(piece.script ?? '');
  const [transcript, setTranscript] = useState(piece.transcript ?? '');
  const [format, setFormat] = useState<ContentFormat | ''>(piece.format ?? '');
  const [platform, setPlatform] = useState(piece.platform.join(', '));
  const [targetPostDate, setTargetPostDate] = useState(piece.target_post_date ?? '');
  const [rawFootageLink, setRawFootageLink] = useState(piece.raw_footage_link ?? '');
  const [videoLink, setVideoLink] = useState(piece.video_link ?? '');
  const [postedLink, setPostedLink] = useState(piece.posted_link ?? '');
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
    if (transcript !== (piece.transcript ?? '')) patch.transcript = transcript || null;
    if (format !== (piece.format ?? '')) patch.format = format || null;
    const nextPlatform = platform.split(',').map((p) => p.trim()).filter(Boolean);
    if (nextPlatform.join(',') !== piece.platform.join(',')) patch.platform = nextPlatform;
    if (targetPostDate !== (piece.target_post_date ?? '')) patch.target_post_date = targetPostDate || null;
    if (rawFootageLink !== (piece.raw_footage_link ?? '')) patch.raw_footage_link = rawFootageLink || null;
    if (videoLink !== (piece.video_link ?? '')) patch.video_link = videoLink || null;
    if (postedLink !== (piece.posted_link ?? '')) patch.posted_link = postedLink || null;
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
        className="content-modal"
        style={{
          background: '#fbfaf7', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <div style={{
          flex: '0 0 auto', padding: '24px 32px', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 16, borderBottom: '1px solid rgba(17,17,17,.08)',
        }}>
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

        <div className="content-modal-body">
        <div className="content-modal-left" style={{ padding: '24px 32px' }}>
          {/* Player leads the left column, Frame.io-style -- the thing being
              reviewed comes before the fields describing it. */}
          {videoLink && (
            /* A Google Drive /preview URL renders Drive's own player inside
               the frame, controls included, so there's nothing to rebuild
               here. Any other embeddable video URL behaves the same way. */
            <iframe
              src={videoLink}
              allow="autoplay"
              style={{
                width: '100%', maxWidth: 360, aspectRatio: '9 / 16', border: 'none',
                borderRadius: 8, background: '#111', marginBottom: 20, display: 'block',
              }}
            />
          )}

          <div style={labelStyle}>Video Link</div>
          <input value={videoLink} onChange={(e) => setVideoLink(e.target.value)} placeholder="https://drive.google.com/file/d/…/preview" style={{ ...fieldStyle, marginBottom: 20 }} />

          <div style={labelStyle}>Visual Hook</div>
          <input value={visualHook} onChange={(e) => setVisualHook(e.target.value)} placeholder="The opening shot / line…" style={{ ...fieldStyle, marginBottom: 20 }} />

          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={labelStyle}>Format</div>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ContentFormat | '')}
                style={fieldStyle}
              >
                <option value="">Uncategorised</option>
                {CONTENT_FORMATS.map((f) => (
                  <option key={f} value={f}>{CONTENT_FORMAT_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={labelStyle}>Target Post Date</div>
              <input type="date" value={targetPostDate} onChange={(e) => setTargetPostDate(e.target.value)} style={fieldStyle} />
            </div>
          </div>

          <div style={labelStyle}>Platform</div>
          <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="IG, TikTok, YouTube…" style={{ ...fieldStyle, marginBottom: 20 }} />

          <div style={labelStyle}>Posted Link</div>
          <input value={postedLink} onChange={(e) => setPostedLink(e.target.value)} placeholder="https://instagram.com/… (once it's live)" style={{ ...fieldStyle, marginBottom: 20 }} />

          <div style={labelStyle}>Raw Footage Link</div>
          <input value={rawFootageLink} onChange={(e) => setRawFootageLink(e.target.value)} placeholder="https://…" style={{ ...fieldStyle, marginBottom: 20 }} />

          <div style={labelStyle}>Script</div>
          <textarea
            value={script} onChange={(e) => setScript(e.target.value)}
            placeholder="Full script goes here…"
            style={{ ...fieldStyle, minHeight: 200, lineHeight: 1.5, resize: 'vertical', marginBottom: 20 }}
          />

          <div style={labelStyle}>Transcript</div>
          <textarea
            value={transcript} onChange={(e) => setTranscript(e.target.value)}
            placeholder="What was actually said in the finished video…"
            style={{ ...fieldStyle, minHeight: 140, lineHeight: 1.5, resize: 'vertical' }}
          />
        </div>

        <div className="content-modal-right">
          <CommentsPanel
            pieceId={piece.id}
            onCountsChange={onCommentCountsChange}
            labelStyle={labelStyle}
            fieldStyle={fieldStyle}
          />
        </div>
        </div>

        <div style={{ flex: '0 0 auto', padding: '18px 32px', borderTop: '1px solid rgba(17,17,17,.08)', display: 'flex', justifyContent: 'space-between' }}>
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
