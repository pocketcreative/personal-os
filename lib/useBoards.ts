'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Board } from '@/lib/types';

// The API returns { error, code } JSON; surface just the message. A missing
// table (migration not applied) is flagged so pages can show the friendly
// "one database step" message instead of a raw error.
export class BoardsApiError extends Error {
  constructor(message: string, public status: number, public missingTable: boolean) { super(message); }
}

async function apiError(res: Response, fallback: string): Promise<BoardsApiError> {
  const body = await res.json().catch(() => null) as { error?: string; code?: string } | null;
  return new BoardsApiError(body?.error || `${fallback} (${res.status})`, res.status, body?.code === 'boards_table_missing');
}

interface BoardsState { boards: Board[]; loading: boolean; error: string | null; missingTable: boolean; }

// Same load-on-mount / event-refresh pattern as useSops. `status` picks the
// active or archived list.
export function useBoards(status: 'active' | 'archived') {
  const [state, setState] = useState<BoardsState>({ boards: [], loading: true, error: null, missingTable: false });
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    let next: BoardsState;
    try {
      const res = await fetch(`/api/boards?status=${status}`);
      if (!res.ok) throw await apiError(res, 'Failed to load boards');
      next = { boards: await res.json(), loading: false, error: null, missingTable: false };
    } catch (e) {
      next = { boards: [], loading: false, error: (e as Error).message, missingTable: e instanceof BoardsApiError && e.missingTable };
    }
    if (mountedRef.current) setState(next);
  }, [status]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    window.addEventListener('boards:refresh', load);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('boards:refresh', load);
    };
  }, [load]);

  return { ...state, reload: load };
}

export async function fetchBoard(id: string): Promise<Board> {
  const res = await fetch(`/api/boards/${encodeURIComponent(id)}`);
  if (!res.ok) throw await apiError(res, 'Failed to load board');
  return res.json();
}

export async function createBoard(title?: string): Promise<Board> {
  const res = await fetch('/api/boards', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(title ? { title } : {}),
  });
  if (!res.ok) throw await apiError(res, 'Create failed');
  return res.json();
}

// Returns the row without the scene, carrying the new updated_at to send with
// the next save.
export async function saveBoard(id: string, patch: Record<string, unknown>, updated_at: string): Promise<Board> {
  const res = await fetch(`/api/boards/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...patch, updated_at }),
  });
  if (!res.ok) {
    const err = await apiError(res, 'Save failed');
    throw res.status === 409 ? new BoardsApiError('This board changed elsewhere -- reload before saving.', 409, false) : err;
  }
  return res.json();
}
