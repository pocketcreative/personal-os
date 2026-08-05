'use client';
import { useEffect, useState } from 'react';
import { addIdea, deleteIdea, fetchIdeas, patchIdea } from '@/lib/clientIdeas';
import type { Idea } from '@/lib/types';

function IdeaRow({ idea, onToggleUsed, onSaveText, onDelete }: {
  idea: Idea;
  onToggleUsed: (id: string, used: boolean) => void;
  onSaveText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(idea.text);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== idea.text) onSaveText(idea.id, trimmed);
    else setDraft(idea.text);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
      borderBottom: '1px solid rgba(17,17,17,.06)',
    }}>
      <input
        type="checkbox"
        checked={idea.used}
        onChange={(e) => onToggleUsed(idea.id, e.target.checked)}
        style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(idea.text); setEditing(false); }
          }}
          style={{
            flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(17,17,17,.15)',
            font: "500 14px 'Inter Tight', sans-serif", color: '#111', background: '#fff',
          }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          style={{
            flex: 1, minWidth: 0, cursor: 'text', font: "500 14px 'Inter Tight', sans-serif",
            color: idea.used ? 'rgba(17,17,17,.35)' : '#111',
            textDecoration: idea.used ? 'line-through' : 'none',
          }}
        >{idea.text}</span>
      )}
      <span
        onClick={() => onDelete(idea.id)}
        title="Delete idea"
        style={{ cursor: 'pointer', color: 'rgba(17,17,17,.3)', fontSize: 15, padding: '2px 4px', flexShrink: 0 }}
      >×</span>
    </div>
  );
}

export default function IdeasBoard() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => { fetchIdeas().then(setIdeas); }, []);

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const created = await addIdea(text);
    if (created) setIdeas((prev) => [created, ...(prev ?? [])]);
  };

  const handleToggleUsed = async (id: string, used: boolean) => {
    setIdeas((prev) => prev?.map((i) => (i.id === id ? { ...i, used } : i)) ?? prev);
    const updated = await patchIdea(id, { used });
    if (!updated) setIdeas((prev) => prev?.map((i) => (i.id === id ? { ...i, used: !used } : i)) ?? prev);
  };

  const handleSaveText = async (id: string, text: string) => {
    const previous = ideas?.find((i) => i.id === id)?.text;
    setIdeas((prev) => prev?.map((i) => (i.id === id ? { ...i, text } : i)) ?? prev);
    const updated = await patchIdea(id, { text });
    if (!updated && previous !== undefined) {
      setIdeas((prev) => prev?.map((i) => (i.id === id ? { ...i, text: previous } : i)) ?? prev);
    }
  };

  const handleDelete = async (id: string) => {
    const removed = ideas?.find((i) => i.id === id);
    setIdeas((prev) => prev?.filter((i) => i.id !== id) ?? prev);
    const ok = await deleteIdea(id);
    if (!ok && removed) setIdeas((prev) => [...(prev ?? []), removed]);
  };

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '32px 16px 56px', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '32px 24px 28px',
      }}>
        <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', marginBottom: 20 }}>
          Ideas
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="New idea…"
            style={{
              flex: '1 1 220px', minWidth: 0, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(17,17,17,.15)',
              font: "500 16px 'Inter Tight', sans-serif", color: '#111', background: '#fff', boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none', background: '#9a7a2e', color: '#fff',
              font: "700 13px 'Inter Tight', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >Add</button>
        </div>

        {!ideas && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
        )}

        {ideas && ideas.length === 0 && (
          <div style={{ font: "500 14px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
            No ideas yet — add one above.
          </div>
        )}

        {ideas?.map((idea) => (
          <IdeaRow
            key={idea.id}
            idea={idea}
            onToggleUsed={handleToggleUsed}
            onSaveText={handleSaveText}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
