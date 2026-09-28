'use client';
import { useState } from 'react';
import { useLinks, createLink, saveLink, deleteLink } from '@/lib/useLinks';
import type { LinkItem } from '@/lib/types';

type Draft = { name: string; url: string; trigger_link: string; live_tested: boolean };

function toDraft(link: LinkItem): Draft {
  return {
    name: link.name,
    url: link.url ?? '',
    trigger_link: link.trigger_link ?? '',
    live_tested: link.live_tested,
  };
}

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box', width: '100%', font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-4)',
  background: 'var(--ink-1)', border: '1px solid rgba(2,74,221,.4)', borderRadius: 6, padding: '5px 8px', outline: 'none',
};
const btnStyle: React.CSSProperties = {
  font: "700 12px 'Inter Tight', sans-serif", borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
  border: '1px solid rgba(17,17,17,.15)', background: '#fff', color: '#111', whiteSpace: 'nowrap',
};
const btnPrimary: React.CSSProperties = { ...btnStyle, background: '#024ADD', color: '#fff', border: '1px solid transparent' };
const btnDanger: React.CSSProperties = { ...btnStyle, background: 'transparent', color: '#c0392b', border: '1px solid rgba(192,57,43,.3)' };

// Small edit form shared by an existing row (Edit) and the new-row form
// (+ Add link) -- same fields either way, just a different Save action.
function EditForm({
  draft, setDraft, onSave, onCancel, saving, err,
}: {
  draft: Draft; setDraft: (d: Draft) => void; onSave: () => void; onCancel: () => void; saving: boolean; err: string | null;
}) {
  return (
    <tr>
      <td><input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" autoFocus /></td>
      <td><input style={inputStyle} value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://..." /></td>
      <td><input style={inputStyle} value={draft.trigger_link} onChange={(e) => setDraft({ ...draft, trigger_link: e.target.value })} placeholder="{{trigger_link...}}" /></td>
      <td>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, font: "600 12.5px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>
          <input type="checkbox" checked={draft.live_tested} onChange={(e) => setDraft({ ...draft, live_tested: e.target.checked })} />
          Live
        </label>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={btnPrimary} disabled={saving || !draft.name.trim()} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button>
          <button style={btnStyle} disabled={saving} onClick={onCancel}>Cancel</button>
        </div>
        {err && <div style={{ marginTop: 4, font: "500 12px 'Inter Tight', sans-serif", color: '#b3261e' }}>{err}</div>}
      </td>
    </tr>
  );
}

function LinkRow({ link, onChanged }: { link: LinkItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(link));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startEdit = () => { setDraft(toDraft(link)); setErr(null); setEditing(true); };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      await saveLink(link.id, {
        name: draft.name.trim(),
        url: draft.url,
        trigger_link: draft.trigger_link,
        live_tested: draft.live_tested,
      }, link.updated_at);
      setEditing(false);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${link.name}"? This archives it and can be restored later, but it leaves the list right away.`)) return;
    setDeleting(true);
    setErr(null);
    try {
      await deleteLink(link.id);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
      setDeleting(false);
    }
  };

  if (editing) {
    return <EditForm draft={draft} setDraft={setDraft} onSave={handleSave} onCancel={() => setEditing(false)} saving={saving} err={err} />;
  }

  return (
    <tr>
      <td className="links-page-name">{link.name}</td>
      <td>
        {link.url ? (
          <a href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a>
        ) : (
          <span className="links-page-note">--</span>
        )}
      </td>
      <td>
        {link.trigger_link ? <code className="links-page-code">{link.trigger_link}</code> : null}
      </td>
      <td>
        {link.live_tested ? <span className="links-page-badge">Yes</span> : null}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={btnStyle} onClick={startEdit}>Edit</button>
          <button style={btnDanger} disabled={deleting} onClick={handleDelete}>{deleting ? 'Deleting…' : 'Delete'}</button>
        </div>
        {err && <div style={{ marginTop: 4, font: "500 12px 'Inter Tight', sans-serif", color: '#b3261e' }}>{err}</div>}
      </td>
    </tr>
  );
}

const EMPTY_DRAFT: Draft = { name: '', url: '', trigger_link: '', live_tested: false };

export default function LinksTable() {
  const { links, loading, error, reload } = useLinks('active');
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setCreateErr(null);
    try {
      await createLink({
        name: newDraft.name.trim(),
        url: newDraft.url,
        trigger_link: newDraft.trigger_link,
        live_tested: newDraft.live_tested,
      });
      setNewDraft(EMPTY_DRAFT);
      setAdding(false);
      reload();
    } catch (e) {
      setCreateErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="links-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="links-page-title">Links</h1>
          <p className="links-page-intro">
            Brendan&apos;s main links, one place. Trigger codes are plain text, ready to paste into GHL.
          </p>
        </div>
        {!adding && (
          <button
            className="tap-44"
            style={{ ...btnPrimary, padding: '8px 16px', marginTop: 4 }}
            onClick={() => { setNewDraft(EMPTY_DRAFT); setCreateErr(null); setAdding(true); }}
          >
            + Add link
          </button>
        )}
      </div>

      {loading && <div style={{ marginTop: 20, font: "500 13px 'Inter Tight', sans-serif", color: 'var(--ink-3)' }}>Loading&hellip;</div>}

      {!loading && error && (
        <div style={{
          marginTop: 20, background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
          padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
        }}>
          Couldn&apos;t load links ({error}).
        </div>
      )}

      {!loading && !error && (
        <div className="links-page-table-wrap">
          <table className="links-page-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Link</th>
                <th>Trigger Link (Automations)</th>
                <th>Live &amp; Tested</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adding && (
                <EditForm
                  draft={newDraft}
                  setDraft={setNewDraft}
                  onSave={handleCreate}
                  onCancel={() => { setAdding(false); setCreateErr(null); }}
                  saving={creating}
                  err={createErr}
                />
              )}
              {links.map((link) => <LinkRow key={link.id} link={link} onChanged={reload} />)}
              {!adding && links.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px 16px' }}>
                    No links yet. Click + Add link to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
