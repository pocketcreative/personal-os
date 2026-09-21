'use client';
import { useState } from 'react';
import { useContentBoard } from '@/lib/useContentBoard';
import ContentDetailModal from './ContentDetailModal';
import type { ContentFormat, ContentPiece } from '@/lib/types';
import { CONTENT_FORMATS, CONTENT_FORMAT_LABELS, CONTENT_STATUS_LABELS } from '@/lib/types';

const COLUMN_WIDTH = 280;

// Format sits in ink, platform keeps the existing gold, so the two pill rows
// read as two different kinds of label instead of one blurred stripe.
const FORMAT_PILL = {
  font: "600 10px 'Inter Tight', sans-serif", color: 'var(--ink-3)',
  background: 'rgba(17,17,17,.06)', padding: '2px 7px', borderRadius: 20,
  letterSpacing: '.04em', textTransform: 'uppercase' as const,
};

function FormatFilterBar({ counts, active, onChange }: {
  counts: Record<string, number>;
  active: ContentFormat | 'all';
  onChange: (next: ContentFormat | 'all') => void;
}) {
  const options: Array<{ key: ContentFormat | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    ...CONTENT_FORMATS.map((f) => ({ key: f, label: CONTENT_FORMAT_LABELS[f] })),
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
      {options.map(({ key, label }) => {
        const on = active === key;
        return (
          // A real <button> (was a plain div onClick) so the filter row is
          // reachable and operable from a keyboard, not just a mouse/touch --
          // aria-pressed reports the toggle state the same way the color
          // swap already communicates it visually.
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={on}
            style={{
              font: "700 11px 'Archivo', sans-serif", letterSpacing: '.04em', textTransform: 'uppercase',
              color: on ? '#fbfaf7' : 'var(--ink-3)',
              background: on ? '#111' : 'transparent',
              border: `1px solid ${on ? '#111' : 'rgba(17,17,17,.12)'}`,
              borderRadius: 20, padding: '8px 14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none',
            }}
          >
            {label}
            <span style={{ color: on ? 'rgba(251,250,247,.55)' : 'var(--ink-3)', fontWeight: 600 }}>
              {counts[key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Long-form content only ever posts to YouTube, so the platform tag adds no
// information on a long-form card -- the Format pill already covers it.
function visiblePlatforms(piece: ContentPiece): string[] {
  return piece.format === 'long_form' ? [] : piece.platform;
}

function ContentCard({ piece, dragging, onOpen, onDragStart, onDragEnd }: {
  piece: ContentPiece;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    // Stays a real <div> (not <button>) because it's also the HTML5
    // drag-and-drop source for moving cards between columns -- role="button"
    // + tabIndex + a matching onKeyDown is the standard substitute so
    // opening a card (the board's single most-used interaction) is still
    // reachable from a keyboard, not just a click or a touch tap.
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`Open ${piece.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      style={{
        background: '#fff', border: '1px solid rgba(17,17,17,.08)', borderRadius: 8,
        padding: '12px 14px', marginBottom: 10, cursor: 'pointer', opacity: dragging ? 0.4 : 1,
        boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ font: "600 14px 'Inter Tight', sans-serif", color: '#111', marginBottom: piece.visual_hook || piece.format || visiblePlatforms(piece).length ? 6 : 0 }}>
        {piece.title}
      </div>
      {piece.visual_hook && (
        <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'var(--ink-3)', marginBottom: 6 }}>
          {piece.visual_hook}
        </div>
      )}
      {/* Unresolved review notes are the whole "needs re-edit" signal -- same
          warning treatment as a task waiting on Brendan, so both boards say
          "this one is on you" the same way. */}
      {piece.unresolved_comment_count > 0 && (
        <div
          title={`${piece.unresolved_comment_count} unresolved comment${piece.unresolved_comment_count === 1 ? '' : 's'}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6,
            font: "600 10px 'Inter Tight', sans-serif", color: '#9a7a2e',
          }}
        >
          <span style={{ fontSize: 11 }}>⚠️</span>
          Needs re-edit
          <span style={{ color: 'rgba(154,122,46,.6)' }}>{piece.unresolved_comment_count}</span>
        </div>
      )}
      {/* Long-form is always YouTube in this system -- the Format pill
          already says "Long-form", so a separate "youtube" platform pill
          next to it would just repeat the same fact. Only shown for other
          formats, where platform actually varies (IG, TikTok, Facebook…). */}
      {(piece.format || visiblePlatforms(piece).length > 0 || piece.target_post_date) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {piece.format && (
            <span style={FORMAT_PILL}>{CONTENT_FORMAT_LABELS[piece.format]}</span>
          )}
          {visiblePlatforms(piece).map((p) => (
            <span key={p} style={{
              font: "600 10px 'Inter Tight', sans-serif", color: '#9a7a2e', background: 'rgba(154,122,46,.1)',
              padding: '2px 7px', borderRadius: 20,
            }}>{p}</span>
          ))}
          {piece.target_post_date && (
            <span style={{ font: "600 10px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>
              {new Date(piece.target_post_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      )}
      <div style={{ font: "600 10px 'Inter Tight', sans-serif", color: 'var(--ink-3)', marginTop: 6 }}>
        Added {new Date(piece.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
    </div>
  );
}

function AddCardInput({ onAdd }: { onAdd: (title: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  // Async now: the draft only clears (and the input closes) once the create
  // actually succeeds. Previously this cleared unconditionally on blur/Enter,
  // so a failed request silently threw away whatever title was typed with no
  // sign anything went wrong -- onBlur made that worse, since clicking
  // anywhere else to dismiss looked identical to a successful add.
  const submit = async () => {
    if (submitting) return; // guards the re-entrant onBlur that disabling the input below can trigger
    const t = draft.trim();
    if (!t) { setOpen(false); return; }
    setSubmitting(true);
    setFailed(false);
    const ok = await onAdd(t);
    setSubmitting(false);
    if (ok) { setDraft(''); setOpen(false); }
    else setFailed(true);
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          font: "600 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)',
          cursor: 'pointer', padding: '8px 2px', background: 'none', border: 'none',
          display: 'block', textAlign: 'left',
        }}
      >+ New</button>
    );
  }
  return (
    <div>
      <input
        autoFocus
        value={draft}
        disabled={submitting}
        onChange={(e) => { setDraft(e.target.value); setFailed(false); }}
        onBlur={submit}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setDraft(''); setFailed(false); setOpen(false); } }}
        placeholder="Title…"
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 6,
          border: `1px solid ${failed ? 'rgba(179,38,30,.5)' : 'rgba(17,17,17,.15)'}`,
          font: "500 16px 'Inter Tight', sans-serif", color: '#111', background: '#fff', boxSizing: 'border-box',
        }}
      />
      {failed && (
        <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: '#b3261e', marginTop: 4 }}>
          Couldn&rsquo;t add, check connection and try again.
        </div>
      )}
    </div>
  );
}

export default function ContentBoard() {
  const board = useContentBoard();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [formatFilter, setFormatFilter] = useState<ContentFormat | 'all'>('all');

  // Counts on the filter pills come off the unfiltered board, so each one says
  // how many pieces you'd get by clicking it.
  const allPieces = board.columns.flatMap((c) => c.pieces);
  const formatCounts: Record<string, number> = { all: allPieces.length };
  for (const f of CONTENT_FORMATS) formatCounts[f] = allPieces.filter((p) => p.format === f).length;

  const handleDrop = (status: (typeof board.columns)[number]['status']) => {
    if (draggedId) {
      const index = dragOverIndex ?? board.columns.find((c) => c.status === status)!.pieces.length;
      board.moveCard(draggedId, status, index);
    }
    setDraggedId(null);
    setDragOverColumn(null);
    setDragOverIndex(null);
  };

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) clamp(18px, 2vw, 24px)', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
      }}>
        <div className="board-header" style={{ marginBottom: 28 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Media Tracker</div>
          <div style={{
            font: "500 12px 'Inter Tight', sans-serif", color: 'var(--ink-3)',
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>

        {board.loading ? (
          // Without this, the board renders its real (empty) column state for
          // a beat before the first fetch resolves -- reads as "you have no
          // content yet" rather than "still loading," which is a lie about
          // real data disappearing, not the truth about a request in flight.
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)', padding: '4px 0 24px' }}>
            Loading…
          </div>
        ) : (
          <>
        <FormatFilterBar counts={formatCounts} active={formatFilter} onChange={setFormatFilter} />

        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
          {board.columns.map((col) => {
            const visible = formatFilter === 'all'
              ? col.pieces
              : col.pieces.filter((p) => p.format === formatFilter);
            return (
            <div
              key={col.status}
              onDragOver={(e) => { e.preventDefault(); setDragOverColumn(col.status); setDragOverIndex(col.pieces.length); }}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.status); }}
              style={{
                flex: `0 0 ${COLUMN_WIDTH}px`, background: dragOverColumn === col.status ? 'rgba(154,122,46,.06)' : 'transparent',
                borderRadius: 8, padding: 8,
              }}
            >
              <div style={{
                font: "700 11px 'Archivo', sans-serif", color: 'var(--ink-3)', letterSpacing: '.04em',
                textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {CONTENT_STATUS_LABELS[col.status]}
                <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{visible.length}</span>
              </div>

              {visible.map((piece) => (
                <div
                  key={piece.id}
                  /* Drop index is taken against the FULL column, not the
                     filtered view, so dragging while a format filter is on
                     still lands the card where it looks like it landed. */
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverColumn(col.status); setDragOverIndex(col.pieces.indexOf(piece)); }}
                >
                  <ContentCard
                    piece={piece}
                    dragging={draggedId === piece.id}
                    onOpen={() => board.setActiveId(piece.id)}
                    onDragStart={() => setDraggedId(piece.id)}
                    onDragEnd={() => { setDraggedId(null); setDragOverColumn(null); setDragOverIndex(null); }}
                  />
                </div>
              ))}

              {/* Creating a card while a specific format tab is active tags the
                  new piece with that format right away, since typing it there
                  already declared which format it belongs to -- no manual
                  format edit needed after. "All" has no single format to
                  default to, so it's left uncategorised as before. */}
              <AddCardInput onAdd={(title) => board.addPiece(title, col.status, formatFilter === 'all' ? undefined : formatFilter)} />
            </div>
            );
          })}
        </div>
          </>
        )}
      </div>

      {board.activePiece && (
        <ContentDetailModal
          piece={board.activePiece}
          onClose={() => board.setActiveId(null)}
          onSave={(patch) => board.updatePiece(board.activePiece!.id, patch)}
          onDelete={() => { board.deletePiece(board.activePiece!.id); board.setActiveId(null); }}
          onCommentCountsChange={(total, unresolved) => board.setCommentCounts(board.activePiece!.id, total, unresolved)}
        />
      )}
    </div>
  );
}
