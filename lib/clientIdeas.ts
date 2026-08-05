import type { Idea } from '@/lib/types';

export async function fetchIdeas(): Promise<Idea[]> {
  const res = await fetch('/api/ideas');
  if (!res.ok) { console.error('fetchIdeas failed', res.status, await res.text()); return []; }
  return res.json();
}

export async function addIdea(text: string): Promise<Idea | null> {
  const res = await fetch('/api/ideas', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
  });
  if (!res.ok) { console.error('addIdea failed', res.status, await res.text()); return null; }
  return res.json();
}

export async function patchIdea(id: string, patch: Partial<Pick<Idea, 'text' | 'used'>>): Promise<Idea | null> {
  const res = await fetch(`/api/ideas/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchIdea failed', res.status, await res.text()); return null; }
  return res.json();
}

export async function deleteIdea(id: string): Promise<boolean> {
  const res = await fetch(`/api/ideas/${id}`, { method: 'DELETE' });
  if (!res.ok) console.error('deleteIdea failed', res.status, await res.text());
  return res.ok;
}
