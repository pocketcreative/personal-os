'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Skill, SkillListItem, SopSystem } from '@/lib/types';

async function fetchSkills(): Promise<{ skills: SkillListItem[]; error: string | null }> {
  const res = await fetch('/api/skills');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { skills: [], error: text || `Failed to load skills (${res.status})` };
  }
  return { skills: await res.json(), error: null };
}

// Fix 2: server-side search (?q=) against slug + full content, so the
// client never has to fetch full content just to search. Called debounced
// from SkillsBoard, not on every keystroke.
export async function searchSkills(q: string): Promise<SkillListItem[]> {
  const res = await fetch(`/api/skills?q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Search failed (${res.status})`);
  }
  return res.json();
}

interface SkillsState { skills: SkillListItem[]; loading: boolean; error: string | null; }

// Same load-on-mount / event-refresh pattern as useAgentsRegistry. Fetches
// the lightweight list once (no `content` -- see SkillListItem) and /skills
// filters it client-side by `source` via the filter chip row, rather than
// two separate pages/API calls.
export function useSkills() {
  const [state, setState] = useState<SkillsState>({ skills: [], loading: true, error: null });
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const result = await fetchSkills();
    if (mountedRef.current) setState({ skills: result.skills, loading: false, error: result.error });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    window.addEventListener('skills:refresh', load);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('skills:refresh', load);
    };
  }, [load]);

  return { skills: state.skills, loading: state.loading, error: state.error, reload: load };
}

export async function fetchSkill(slug: string): Promise<Skill> {
  const res = await fetch(`/api/skills/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Failed to load skill (${res.status})`);
  return res.json();
}

export async function saveSkillContent(
  slug: string, content: string, updated_at: string, systems?: SopSystem[],
): Promise<Skill & { warning: string | null }> {
  const res = await fetch(`/api/skills/${encodeURIComponent(slug)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, updated_at, systems }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(res.status === 409 ? 'This skill changed elsewhere -- reload before saving.' : (text || `Save failed (${res.status})`));
  }
  return res.json();
}
