'use client';
import { useCallback, useEffect, useState } from 'react';

export interface StrategyDocData { id: string; slug: string; title: string; content: string; updated_at: string }
export interface StrategyVersionRef { id: string; saved_at: string }
export interface StrategyVersion extends StrategyVersionRef { content: string }

async function errorText(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return body?.error || `${fallback} (${res.status})`;
}

interface DocPayload { doc: StrategyDocData; versions: StrategyVersionRef[] }

async function fetchDoc(slug: string): Promise<DocPayload> {
  const res = await fetch(`/api/strategy/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(await errorText(res, 'Could not load'));
  return res.json();
}

interface DocState { doc: StrategyDocData | null; versions: StrategyVersionRef[]; loading: boolean; error: string | null }

// Same load-on-mount pattern as useSops.
export function useStrategyDoc(slug: string) {
  const [state, setState] = useState<DocState>({ doc: null, versions: [], loading: true, error: null });

  const load = useCallback(async () => {
    try {
      const data = await fetchDoc(slug);
      setState({ doc: data.doc, versions: data.versions, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  const { doc, versions, loading, error } = state;

  // Saves new text, then re-reads the doc and version list. Throws with a readable message.
  const save = useCallback(async (content: string) => {
    const res = await fetch(`/api/strategy/${encodeURIComponent(slug)}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(await errorText(res, 'Save failed'));
    const data = await res.json() as { unchanged: boolean };
    await load();
    return data.unchanged;
  }, [slug, load]);

  const fetchVersion = useCallback(async (versionId: string): Promise<StrategyVersion> => {
    const res = await fetch(`/api/strategy/${encodeURIComponent(slug)}/versions/${encodeURIComponent(versionId)}`);
    if (!res.ok) throw new Error(await errorText(res, 'Could not load that version'));
    return res.json();
  }, [slug]);

  return { doc, versions, loading, error, save, fetchVersion };
}
