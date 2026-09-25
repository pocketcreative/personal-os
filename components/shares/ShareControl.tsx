'use client';
import { useState } from 'react';
import { createShare, fetchShares, setShareRevoked } from '@/lib/useShares';
import type { ShareResource, ShareWithStatus } from '@/lib/shares';

const btn: React.CSSProperties = {
  font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
  background: '#fff', color: '#111', border: '1px solid rgba(17,17,17,.15)', whiteSpace: 'nowrap',
};
const small: React.CSSProperties = {
  font: "700 12px 'Inter Tight', sans-serif", color: '#024ADD', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
};
const muted: React.CSSProperties = { font: "500 11.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)' };

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

const STATUS_LABEL = { active: 'Active', expired: 'Expired', off: 'Turned off' } as const;
const STATUS_COLOR = { active: '#4b7a4f', expired: '#9a7a2e', off: '#b3261e' } as const;

// A "Share" button that opens a small panel to make, copy and switch off
// view-only links for one SOP, board or skill. `align` picks which edge the panel
// lines up with, so it stays on screen wherever the button sits.
export default function ShareControl({ type, id, align = 'left' }: { type: ShareResource; id: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<ShareWithStatus[] | null>(null);
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // A missing table comes back from the API as the friendly "one database step" message.
  const fail = (e: unknown) => setError((e as Error).message);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setError(null);
    try { setShares(await fetchShares(type, id)); } catch (e) { fail(e); }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await createShare(type, id, expiresOn);
      setShares((list) => [made, ...(list ?? [])]);
      setExpiresOn('');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const flip = async (s: ShareWithStatus) => {
    setError(null);
    try {
      const updated = await setShareRevoked(s.id, s.status !== 'off');
      setShares((list) => (list ?? []).map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) { fail(e); }
  };

  const copy = async (s: ShareWithStatus) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${s.token}`);
      setCopied(s.id);
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 1500);
    } catch {
      setError('Could not copy, your browser blocked it.');
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={toggle} style={btn}>Share</button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 60, width: 'min(380px, calc(100vw - 32px))',
          boxSizing: 'border-box', background: '#fff', border: '1px solid rgba(17,17,17,.15)', borderRadius: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,.12)', padding: 16, textAlign: 'left',
        }}>
          <div style={{ font: "700 13px 'Inter Tight', sans-serif", color: '#111', marginBottom: 4 }}>View-only links</div>
          <div style={{ ...muted, marginBottom: 12 }}>
            Anyone with the link can view this. Don&apos;t share anything private.
            {type !== 'board' && ' Shows the last saved client version.'}
          </div>

          {error && (
            <div style={{
              background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
              padding: '8px 10px', font: "500 12px 'Inter Tight', sans-serif", color: '#8a2a22', marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <label style={{ ...muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Expires on (optional)
              <input
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
                style={{ font: "500 13px 'Inter Tight', sans-serif", padding: '7px 8px', border: '1px solid rgba(17,17,17,.14)', borderRadius: 8 }}
              />
            </label>
            <button
              onClick={create}
              disabled={busy}
              style={{ ...btn, background: '#024ADD', color: '#fff', border: '1px solid transparent', opacity: busy ? 0.5 : 1 }}
            >
              Create link
            </button>
          </div>

          {shares && shares.length === 0 && <div style={muted}>No links yet.</div>}
          {shares?.map((s) => (
            <div key={s.id} style={{ borderTop: '1px solid rgba(17,17,17,.08)', padding: '10px 0 2px' }}>
              <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: '#111' }}>
                Created {fmtDate(s.created_at)} &middot; {s.expires_at ? `expires ${fmtDate(s.expires_at)}` : 'never expires'}
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 4 }}>
                <span style={{ font: "700 11.5px 'Inter Tight', sans-serif", color: STATUS_COLOR[s.status] }}>{STATUS_LABEL[s.status]}</span>
                <button onClick={() => copy(s)} style={small}>{copied === s.id ? 'Copied' : 'Copy link'}</button>
                <button onClick={() => flip(s)} style={small}>{s.status === 'off' ? 'Turn on' : 'Turn off'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
