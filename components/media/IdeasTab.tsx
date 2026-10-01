'use client';
import { useState } from 'react';
import { useContentIdeas } from '@/lib/useContentIdeas';
import { useShareContext } from '@/lib/shareContext';

// Mirrors Notion's real "Content Ideas" schema exactly (Idea / Notes / Used --
// confirmed via live fetch, decision 4) as a simple inline-editable table,
// simpler than forcing an idea through the 5-type content_items shape, which
// has no meaningful Stage/Status/Post Date for a loose topic idea.
//
// Reused as-is on the public /share/[token] CMS view: editing an idea's text/
// notes/used still works there (share-scoped PATCH, see
// app/api/share/[token]/content-ideas/[id]), only adding and deleting are
// hidden since no share-scoped route creates or removes one.
export default function IdeasTab() {
  const { ideas, loading, addIdea, updateIdea, deleteIdea } = useContentIdeas();
  const share = useShareContext();
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const visibleIdeas = query
    ? ideas.filter((i) => i.idea.toLowerCase().includes(query) || (i.notes ?? '').toLowerCase().includes(query))
    : ideas;

  async function submit() {
    const text = draft.trim();
    if (!text || adding) return;
    setAdding(true);
    const ok = await addIdea(text);
    setAdding(false);
    if (ok) setDraft('');
  }

  const fieldStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid rgba(17,17,17,.1)',
    borderRadius: 6, background: '#fff', fontFamily: "'Inter Tight', sans-serif", fontSize: 13, color: '#111', outline: 'none',
  };

  return (
    <div style={{ padding: '0 clamp(14px, 3vw, 44px) 24px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ideas…"
          style={{ flex: 1, padding: '10px 14px', border: '1px solid rgba(17,17,17,.12)', borderRadius: 8, background: '#fff', fontFamily: "'Inter Tight', sans-serif", fontSize: 14, outline: 'none' }}
        />
      </div>

      {!share && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <input
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="New idea…"
            style={{ flex: 1, padding: '10px 14px', border: '1px solid rgba(17,17,17,.12)', borderRadius: 8, background: '#fff', fontFamily: "'Inter Tight', sans-serif", fontSize: 14, outline: 'none' }}
          />
          <button onClick={submit} disabled={adding || !draft.trim()} style={{
            font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#024ADD',
            border: 'none', borderRadius: 8, padding: '10px 20px', cursor: adding ? 'default' : 'pointer',
            opacity: adding || !draft.trim() ? 0.5 : 1,
          }}>Add</button>
        </div>
      )}

      {loading ? (
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '20px 0' }}>Loading…</div>
      ) : ideas.length === 0 ? (
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '20px 0' }}>No ideas yet.</div>
      ) : query && visibleIdeas.length === 0 ? (
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '20px 0' }}>No matches</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleIdeas.map((idea) => (
            <div key={idea.id} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff',
              border: '1px solid rgba(17,17,17,.08)', borderRadius: 8, padding: 10,
              opacity: idea.used ? 0.55 : 1,
            }}>
              <input
                type="checkbox" checked={idea.used} onChange={(e) => updateIdea(idea.id, { used: e.target.checked })}
                title="Used" style={{ marginTop: 8, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  defaultValue={idea.idea}
                  onBlur={(e) => { if (e.target.value.trim() && e.target.value !== idea.idea) updateIdea(idea.id, { idea: e.target.value.trim() }); }}
                  style={{ ...fieldStyle, font: "600 13.5px 'Inter Tight', sans-serif", border: 'none', padding: '2px 0' }}
                />
                <textarea
                  defaultValue={idea.notes ?? ''}
                  placeholder="Notes…"
                  onBlur={(e) => { if (e.target.value !== (idea.notes ?? '')) updateIdea(idea.id, { notes: e.target.value || null }); }}
                  rows={1}
                  style={{ ...fieldStyle, border: 'none', padding: '2px 0', resize: 'vertical', color: 'rgba(17,17,17,.6)' }}
                />
              </div>
              {!share && (
                <button
                  onClick={() => { if (confirm(`Delete "${idea.idea}"?`)) deleteIdea(idea.id); }}
                  style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(192,57,43,.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                >Delete</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
