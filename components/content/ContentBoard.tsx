'use client';
import { useState } from 'react';
import { useContentBoard } from '@/lib/useContentBoard';
import ContentDetailModal from './ContentDetailModal';
import type { ContentPiece } from '@/lib/types';
import { CONTENT_STATUS_LABELS } from '@/lib/types';

const COLUMN_WIDTH = 280;

function ContentCard({ piece, dragging, onOpen, onDragStart, onDragEnd }: {
  piece: ContentPiece;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid rgba(17,17,17,.08)', borderRadius: 8,
        padding: '12px 14px', marginBottom: 10, cursor: 'pointer', opacity: dragging ? 0.4 : 1,
        boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ font: "600 14px 'Inter Tight', sans-serif", color: '#111', marginBottom: piece.visual_hook || piece.platform.length ? 6 : 0 }}>
        {piece.title}
      </div>
      {piece.visual_hook && (
        <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', marginBottom: 6 }}>
          {piece.visual_hook}
        </div>
      )}
      {(piece.platform.length > 0 || piece.target_post_date) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {piece.platform.map((p) => (
            <span key={p} style={{
              font: "600 10px 'Inter Tight', sans-serif", color: '#9a7a2e', background: 'rgba(154,122,46,.1)',
              padding: '2px 7px', borderRadius: 20,
            }}>{p}</span>
          ))}
          {piece.target_post_date && (
            <span style={{ font: "600 10px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
              {new Date(piece.target_post_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function AddCardInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const submit = () => {
    const t = draft.trim();
    if (t) onAdd(t);
    setDraft('');
    setOpen(false);
  };
  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          font: "600 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
          cursor: 'pointer', padding: '8px 2px',
        }}
      >+ New</div>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setDraft(''); setOpen(false); } }}
      placeholder="Title…"
      style={{
        width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(17,17,17,.15)',
        font: "500 13px 'Inter Tight', sans-serif", color: '#111', background: '#fff', boxSizing: 'border-box',
      }}
    />
  );
}

export default function ContentBoard() {
  const board = useContentBoard();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '56px 24px', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '40px 44px 32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Media Tracker</div>
          <div style={{
            font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
          {board.columns.map((col) => (
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
                font: "700 11px 'Archivo', sans-serif", color: 'rgba(17,17,17,.5)', letterSpacing: '.04em',
                textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {CONTENT_STATUS_LABELS[col.status]}
                <span style={{ color: 'rgba(17,17,17,.3)', fontWeight: 600 }}>{col.pieces.length}</span>
              </div>

              {col.pieces.map((piece, i) => (
                <div
                  key={piece.id}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverColumn(col.status); setDragOverIndex(i); }}
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

              <AddCardInput onAdd={(title) => board.addPiece(title, col.status)} />
            </div>
          ))}
        </div>
      </div>

      {board.activePiece && (
        <ContentDetailModal
          piece={board.activePiece}
          onClose={() => board.setActiveId(null)}
          onSave={(patch) => board.updatePiece(board.activePiece!.id, patch)}
          onDelete={() => { board.deletePiece(board.activePiece!.id); board.setActiveId(null); }}
        />
      )}
    </div>
  );
}
