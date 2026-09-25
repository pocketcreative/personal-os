'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useBoards, createBoard, saveBoard } from '@/lib/useBoards';
import { BOARDS_MISSING_MESSAGE } from '@/lib/boardScene';
import { STORAGE_LIMIT_LABEL, formatBytes } from '@/lib/boardImages';
import type { Board } from '@/lib/types';

const smallBtn: React.CSSProperties = {
  font: "700 13px 'Inter Tight', sans-serif", borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
  border: '1px solid rgba(17,17,17,.15)', background: '#fff', color: '#111',
};

function updatedLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function BoardCard({ board, onChanged }: { board: Board; onChanged: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(board.title);
  const [err, setErr] = useState<string | null>(null);

  const update = async (patch: Record<string, unknown>) => {
    setErr(null);
    try {
      await saveBoard(board.id, patch, board.updated_at);
      setRenaming(false);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10, background: '#fff', border: '1px solid rgba(17,17,17,.08)',
      borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
    }}>
      {renaming ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) update({ title: name.trim() });
            if (e.key === 'Escape') { setRenaming(false); setName(board.title); }
          }}
          style={{
            boxSizing: 'border-box', font: "700 15px 'Inter Tight', sans-serif", color: '#111',
            padding: '6px 10px', border: '1px solid rgba(2,74,221,.4)', borderRadius: 6, outline: 'none',
          }}
        />
      ) : (
        <Link href={`/boards/${board.id}`} className="tap-44" style={{ textDecoration: 'none', justifyContent: 'flex-start' }}>
          <div style={{ font: "700 15px 'Inter Tight', sans-serif", color: '#111', letterSpacing: '-0.01em' }}>{board.title}</div>
        </Link>
      )}
      <div style={{ font: "600 12.5px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>
        Updated {updatedLabel(board.updated_at)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {renaming ? (
          <>
            <button className="tap-44" style={smallBtn} disabled={!name.trim()} onClick={() => update({ title: name.trim() })}>Save</button>
            <button className="tap-44" style={smallBtn} onClick={() => { setRenaming(false); setName(board.title); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="tap-44" style={smallBtn} onClick={() => setRenaming(true)}>Rename</button>
            <button className="tap-44" style={smallBtn} onClick={() => update({ status: board.status === 'active' ? 'archived' : 'active' })}>
              {board.status === 'active' ? 'Archive' : 'Restore'}
            </button>
          </>
        )}
        {err && <span style={{ font: "500 13px 'Inter Tight', sans-serif", color: '#b3261e' }}>{err}</span>}
      </div>
    </div>
  );
}

export default function BoardsBoard() {
  const [archived, setArchived] = useState(false);
  const { boards, loading, error, missingTable, reload } = useBoards(archived ? 'archived' : 'active');
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  // Space used by all boards. Stays null (and hidden) if the lookup fails.
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/boards/usage')
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { bytes?: number } | null) => { if (!cancelled && typeof d?.bytes === 'number') setUsedBytes(d.bytes); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const newBoard = async () => {
    setCreating(true);
    setCreateErr(null);
    try {
      const b = await createBoard();
      router.push(`/boards/${b.id}`);
    } catch (e) {
      setCreateErr((e as Error).message);
      setCreating(false);
    }
  };

  return (
    <div style={{ width: '96%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
      }}>
        <div className="board-header" style={{ marginBottom: 8 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Boards</div>
          {usedBytes !== null && (
            <div style={{ font: "500 12.5px 'Inter Tight', sans-serif", color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
              {formatBytes(usedBytes)} used of {STORAGE_LIMIT_LABEL}
            </div>
          )}
        </div>
        <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'var(--ink-3)', marginBottom: 20, maxWidth: 720 }}>
          Whiteboards for mapping things out: shapes, arrows, text and images. Every board saves itself as you draw.
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <button
            onClick={newBoard}
            disabled={creating || missingTable}
            className="tap-44"
            style={{
              font: "700 14px 'Inter Tight', sans-serif", borderRadius: 8, padding: '10px 16px', cursor: 'pointer',
              border: '1px solid transparent', background: '#024ADD', color: '#fff', whiteSpace: 'nowrap',
              opacity: creating || missingTable ? 0.5 : 1,
            }}
          >
            {creating ? 'Creating…' : '+ New board'}
          </button>
          <button
            onClick={() => setArchived((a) => !a)}
            className="tap-44"
            style={{
              font: "700 13px 'Inter Tight', sans-serif", borderRadius: 20, padding: '5px 16px', cursor: 'pointer',
              border: archived ? '1px solid #024ADD' : '1px solid rgba(17,17,17,.15)',
              background: archived ? 'rgba(2,74,221,.08)' : '#fff',
              color: archived ? '#024ADD' : 'rgba(17,17,17,.6)',
            }}
          >
            Archived
          </button>
          {createErr && <span style={{ font: "500 13px 'Inter Tight', sans-serif", color: '#b3261e' }}>{createErr}</span>}
        </div>

        {loading && <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>Loading&hellip;</div>}

        {!loading && error && (
          <div style={{
            background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
            padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
          }}>
            {missingTable ? BOARDS_MISSING_MESSAGE : `Couldn't load boards (${error}).`}
          </div>
        )}

        {!loading && !error && boards.length === 0 && (
          <div style={{
            border: '1px dashed rgba(17,17,17,.15)', borderRadius: 10, padding: '40px 20px', textAlign: 'center',
            font: "500 14px 'Inter Tight', sans-serif", color: 'var(--ink-3)',
          }}>
            {archived ? 'No archived boards.' : 'No boards yet. Create your first one.'}
          </div>
        )}

        {!loading && !error && boards.length > 0 && (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {boards.map((b) => <BoardCard key={b.id} board={b} onChanged={reload} />)}
          </div>
        )}
      </div>
    </div>
  );
}
