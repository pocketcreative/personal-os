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

// mm:ss under an hour, h:mm:ss past it. Rounds to the nearest whole second
// on the total first, then derives h/m/s from that integer -- rounding each
// unit separately (the previous version rounded seconds against the raw
// fractional input) could land on "0:60" for anything at 59.5s or later.
function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Pulls the Drive file id out of a "/file/d/<id>/..." link (the shape both
// the /preview embed and the plain "view" URL share). Null for anything else
// -- a non-Drive URL Brendan pasted by hand, most likely.
function driveFileId(link: string): string | null {
  const match = link.match(/\/file\/d\/([^/]+)\//);
  return match ? match[1] : null;
}

// The /preview embed URL only renders reliably when the viewing session is
// authenticated as the file's owner -- on mobile Safari without that, it can
// show Google's cookie-consent wall or just fail to load. This derives the
// plain Drive "view" URL as a fallback link so there's always a way to open
// the file directly. Falls back to the raw link for any non-Drive URL.
function driveViewUrl(link: string): string {
  const id = driveFileId(link);
  return id ? `https://drive.google.com/file/d/${id}/view` : link;
}

// The real player src: our own streaming proxy (app/api/media/[fileId]/stream)
// so the browser gets a native <video> element we fully control instead of
// Drive's opaque iframe player, while the file itself stays hosted on Drive.
// Falls back to using the raw link directly as a best-effort <video> src for
// any non-Drive URL Brendan might have pasted by hand.
function streamSrc(link: string): string {
  const id = driveFileId(link);
  return id ? `/api/media/${id}/stream` : link;
}

// Frame.io-style native player: real <video> element, a custom control bar
// (play/pause, time readout, scrubber), and a marker on the scrubber for
// every comment that has a timestamp. Owns the <video> element itself but
// reports playback position up via onTimeUpdate so the comment composer
// (rendered elsewhere in the tree) can read the current second without this
// component needing to know anything about comments beyond their markers.
function VideoPlayer({ src, videoRef, markers, onTimeUpdate, onMarkerClick }: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  markers: { id: string; timestamp: number }[];
  onTimeUpdate: (seconds: number) => void;
  onMarkerClick: (commentId: string) => void;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Guards the division-by-zero window before metadata has loaded (duration
  // starts at 0, and some streamed sources briefly report Infinity).
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progressPct = safeDuration > 0 ? Math.min(100, (currentTime / safeDuration) * 100) : 0;

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play(); else video.pause();
  }

  function seekFromClientX(clientX: number, track: HTMLDivElement) {
    const video = videoRef.current;
    if (!video || safeDuration <= 0) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    video.currentTime = frac * safeDuration;
  }

  return (
    <div style={{ width: '100%', maxWidth: 360, borderRadius: 8, overflow: 'hidden', background: '#111' }}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        onClick={togglePlay}
        style={{ width: '100%', aspectRatio: '9 / 16', display: 'block', background: '#111', cursor: 'pointer' }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrentTime(t);
          onTimeUpdate(t);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      <div style={{ padding: '10px 12px 12px' }}>
        {/* Taller click target than the visible track so the scrubber is
            easy to tap on mobile without the bar itself looking thick. */}
        <div
          onClick={(e) => seekFromClientX(e.clientX, e.currentTarget)}
          style={{ position: 'relative', height: 14, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <div style={{ position: 'relative', width: '100%', height: 4, borderRadius: 999, background: 'rgba(255,255,255,.18)' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, borderRadius: 999,
              width: `${progressPct}%`, background: '#024ADD',
            }} />
            {safeDuration > 0 && markers.map((m) => (
              <div
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  const video = videoRef.current;
                  if (video) video.currentTime = m.timestamp;
                  onMarkerClick(m.id);
                }}
                title={formatTimestamp(m.timestamp)}
                style={{
                  position: 'absolute', top: '50%',
                  left: `${Math.min(100, Math.max(0, (m.timestamp / safeDuration) * 100))}%`,
                  width: 9, height: 9, borderRadius: '50%', background: '#E2B246',
                  border: '1.5px solid #111', transform: 'translate(-50%, -50%)',
                  cursor: 'pointer', zIndex: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <button
            type="button"
            onClick={togglePlay}
            style={{
              flex: '0 0 auto', width: 28, height: 28, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,.14)', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
            }}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <span style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(255,255,255,.75)', letterSpacing: '.01em' }}>
            {formatTimestamp(currentTime)} / {formatTimestamp(safeDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CommentRow({ comment, highlighted, onToggleResolved, onDelete }: {
  comment: ContentComment;
  highlighted: boolean;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  // Same gold-for-AI rule the task board uses on its owner column, so a note
  // written by an agent reads the same way in both places.
  const isAgent = /agent|^ai$/i.test(comment.author);
  return (
    <div
      id={`comment-${comment.id}`}
      style={{
        padding: '10px 8px', margin: '0 -8px', borderRadius: 6,
        borderTop: '1px solid rgba(17,17,17,.07)',
        opacity: comment.resolved ? 0.45 : 1,
        background: highlighted ? 'rgba(2,74,221,.08)' : 'transparent',
        transition: 'background-color .5s ease',
      }}
    >
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
// re-edit" badge on the card. Comments themselves are owned one level up (in
// ContentDetailModal) since the video player's scrubber markers need the
// same list -- this component is the presentational thread + composer.
function CommentsPanel({
  comments, loading, addComment, setResolved, deleteComment,
  labelStyle, fieldStyle, highlightedCommentId, currentSecondRef,
}: {
  comments: ContentComment[];
  loading: boolean;
  addComment: (body: string, videoTimestampSeconds: number | null) => void;
  setResolved: (commentId: string, resolved: boolean) => void;
  deleteComment: (commentId: string) => void;
  labelStyle: React.CSSProperties;
  fieldStyle: React.CSSProperties;
  highlightedCommentId: string | null;
  currentSecondRef: React.RefObject<number>;
}) {
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

  // Auto-fills the timecode with the video's current playback second the
  // moment the user starts writing a note -- but only while the field is
  // still untouched, so it never overwrites something they already typed.
  const autofillTimestamp = () => {
    if (ts.trim()) return;
    setTs(formatTimestamp(Math.floor(currentSecondRef.current)));
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
                highlighted={c.id === highlightedCommentId}
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
          onFocus={autofillTimestamp}
          placeholder="What needs changing…"
          style={{ ...fieldStyle, minHeight: 70, lineHeight: 1.45, resize: 'vertical', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={ts}
            onChange={(e) => setTs(e.target.value)}
            onFocus={autofillTimestamp}
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

  // Mobile-only tab switcher (Details / Comments), Frame.io mobile app
  // style -- desktop ignores this entirely and always shows both columns.
  // See .content-modal-tabs / .content-modal-tab-hidden in globals.css.
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('details');
  const [commentCounts, setCommentCounts] = useState({ total: 0, unresolved: 0 });

  // Comments live here, not inside CommentsPanel, because the video player's
  // scrubber markers need the same list. currentSecondRef is a ref rather
  // than state deliberately: the <video> timeupdate event fires several
  // times a second, and nothing outside the player itself needs to re-render
  // on every tick -- the comment composer only reads the ref's current value
  // once, at the moment the user focuses it.
  const { comments, loading: commentsLoading, addComment, setResolved, deleteComment } = useContentComments(
    piece.id,
    (total, unresolved) => { setCommentCounts({ total, unresolved }); onCommentCountsChange?.(total, unresolved); },
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentSecondRef = useRef(0);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markerComments = comments
    .filter((c): c is ContentComment & { video_timestamp_seconds: number } => c.video_timestamp_seconds != null)
    .map((c) => ({ id: c.id, timestamp: c.video_timestamp_seconds }));

  function handleMarkerClick(commentId: string) {
    // Switching to the Comments tab is a no-op on desktop (both columns are
    // already visible there) but on mobile it's the only way the highlighted
    // row is actually on screen to scroll to.
    setActiveTab('comments');
    setHighlightedCommentId(commentId);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedCommentId(null), 1800);
  }

  useEffect(() => {
    if (!highlightedCommentId) return;
    // Runs after the tab-switch render above has committed, so the row is
    // actually in the (visible) DOM by the time this looks for it.
    const el = document.getElementById(`comment-${highlightedCommentId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedCommentId]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

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
  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, font: "700 11px 'Archivo', sans-serif", letterSpacing: '.05em',
    textTransform: 'uppercase', color: active ? '#fff' : 'rgba(17,17,17,.45)',
    background: active ? '#111' : 'rgba(17,17,17,.06)',
    border: 'none', borderRadius: 7, padding: '10px 16px', cursor: 'pointer',
  });

  // LTS-format pieces (and possibly others) only ever have a transcript, never
  // a written script -- so a piece with content in just one of the two only
  // needs that one field on screen. Both render when both actually have
  // content (a long-form piece can have a written script that was then
  // recorded slightly differently). When neither has content yet, Script
  // stays as the one empty field so there's still somewhere to type a draft.
  const hasScript = script.trim().length > 0;
  const hasTranscript = transcript.trim().length > 0;
  const showScript = hasScript || !hasTranscript;
  const showTranscript = hasTranscript;

  // Raw Footage Link is only useful when it's an actual clickable URL --
  // some pieces have a local Mac file path in this field instead, which is
  // dead weight to show on a page someone's browsing from their phone.
  const showRawFootageLink = /^https?:\/\//i.test(rawFootageLink.trim());

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
              reviewed comes before the fields describing it. On mobile it
              stays above the Details/Comments tabs below, always visible
              either way since it's the primary content. */}
          {videoLink && (
            <VideoPlayer
              src={streamSrc(videoLink)}
              videoRef={videoRef}
              markers={markerComments}
              onTimeUpdate={(t) => { currentSecondRef.current = t; }}
              onMarkerClick={handleMarkerClick}
            />
          )}

          {videoLink && (
            // Resilience fallback, not the real fix: if the streaming proxy
            // ever fails to load (auth hiccup, a file the service account
            // hasn't been individually shared on yet, etc.) this always gives
            // a way to watch it directly on Drive instead.
            <a
              href={driveViewUrl(videoLink)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', font: "600 12px 'Inter Tight', sans-serif",
                color: 'rgba(17,17,17,.45)', marginTop: 6, marginBottom: 20, textDecoration: 'none',
              }}
            >
              Open in Google Drive ↗
            </a>
          )}

          {/* Mobile-only: switches the Details fields / Comments column
              below between tabs instead of one long scroll that buried
              comments at the bottom. Desktop hides this and always shows
              both (see .content-modal-tabs in globals.css). */}
          <div className="content-modal-tabs">
            <button type="button" onClick={() => setActiveTab('details')} style={tabButtonStyle(activeTab === 'details')}>
              Details
            </button>
            <button type="button" onClick={() => setActiveTab('comments')} style={tabButtonStyle(activeTab === 'comments')}>
              {`Comments${commentCounts.total > 0 ? ` (${commentCounts.total})` : ''}`}
              {commentCounts.unresolved > 0 && ' ⚠️'}
            </button>
          </div>

          <div className={`content-modal-details${activeTab === 'comments' ? ' content-modal-tab-hidden' : ''}`}>
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

            {showRawFootageLink && (
              <>
                <div style={labelStyle}>Raw Footage Link</div>
                <input value={rawFootageLink} onChange={(e) => setRawFootageLink(e.target.value)} placeholder="https://…" style={{ ...fieldStyle, marginBottom: 20 }} />
              </>
            )}

            {showScript && (
              <>
                <div style={labelStyle}>Script</div>
                <textarea
                  value={script} onChange={(e) => setScript(e.target.value)}
                  placeholder="Full script goes here…"
                  style={{ ...fieldStyle, minHeight: 200, lineHeight: 1.5, resize: 'vertical', marginBottom: 20 }}
                />
              </>
            )}

            {showTranscript && (
              <>
                <div style={labelStyle}>Transcript</div>
                <textarea
                  value={transcript} onChange={(e) => setTranscript(e.target.value)}
                  placeholder="What was actually said in the finished video…"
                  style={{ ...fieldStyle, minHeight: 140, lineHeight: 1.5, resize: 'vertical' }}
                />
              </>
            )}
          </div>
        </div>

        <div className={`content-modal-right${activeTab === 'details' ? ' content-modal-tab-hidden' : ''}`}>
          <CommentsPanel
            comments={comments}
            loading={commentsLoading}
            addComment={addComment}
            setResolved={setResolved}
            deleteComment={deleteComment}
            labelStyle={labelStyle}
            fieldStyle={fieldStyle}
            highlightedCommentId={highlightedCommentId}
            currentSecondRef={currentSecondRef}
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
