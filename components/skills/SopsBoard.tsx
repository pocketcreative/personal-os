'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useSops, createSop } from '@/lib/useSops';
import { useSkills } from '@/lib/useSkills';
import { SOP_SYSTEMS, type Sop, type SopSystem } from '@/lib/types';
import SkillsAreaNav from '@/components/skills/SkillsAreaNav';

const chip: React.CSSProperties = {
  font: "700 10.5px 'Archivo', sans-serif", color: '#024ADD',
  background: 'rgba(2,74,221,.08)', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
};
const chipGold: React.CSSProperties = { ...chip, color: '#9a7a2e', background: 'rgba(154,122,46,.10)' };

function SopCard({ sop, skillSlug }: { sop: Sop; skillSlug: string | null }) {
  return (
    <Link
      href={`/skills/sops/${sop.id}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none',
        background: '#fff', border: '1px solid rgba(17,17,17,.08)', borderRadius: 10,
        padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ font: "700 15px 'Inter Tight', sans-serif", color: '#111', letterSpacing: '-0.01em' }}>
        {sop.title}
      </div>
      {sop.systems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sop.systems.map((s) => <span key={s} style={chip}>{s}</span>)}
        </div>
      )}
      {skillSlug && <span style={chipGold}>Linked: {skillSlug}</span>}
      <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
        v{sop.version} &middot; {sop.version_date}
      </div>
    </Link>
  );
}

export default function SopsBoard() {
  const { sops, loading, error } = useSops();
  const { skills } = useSkills();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [systemFilter, setSystemFilter] = useState<SopSystem[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const skillSlugById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of skills) map.set(s.id, s.slug);
    return map;
  }, [skills]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return sops.filter((s) => {
      if (query && !s.title.toLowerCase().includes(query)) return false;
      if (systemFilter.length > 0 && !systemFilter.some((f) => s.systems.includes(f))) return false;
      return true;
    });
  }, [sops, q, systemFilter]);

  const toggleSystem = (sys: SopSystem) => {
    setSystemFilter((prev) => (prev.includes(sys) ? prev.filter((s) => s !== sys) : [...prev, sys]));
  };

  const submitCreate = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    setCreateErr(null);
    try {
      const sop = await createSop(newTitle.trim());
      router.push(`/skills/sops/${sop.id}`);
    } catch (e) {
      setCreateErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div style={{ width: '96%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
      }}>
        <SkillsAreaNav />
        <div className="board-header" style={{ marginBottom: 8 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>SOPs</div>
        </div>
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', marginBottom: 20, maxWidth: 720 }}>
          Written for people, not agents. Title, Goal, Principles, Steps, Example, Checklist -- for handing a real process to someone. Only a small curated set, written when you actually want to hand a process off.
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title..."
            style={{
              flex: '1 1 220px', boxSizing: 'border-box', font: "500 13.5px 'Inter Tight', sans-serif", color: '#111',
              padding: '10px 14px', border: '1px solid rgba(17,17,17,.12)', borderRadius: 8, background: '#fff',
              outline: 'none',
            }}
          />
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              style={{
                font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '10px 16px',
                cursor: 'pointer', border: '1px solid transparent', background: '#024ADD', color: '#fff', whiteSpace: 'nowrap',
              }}
            >
              + New SOP
            </button>
          )}
        </div>

        {creating && (
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20,
            background: '#fff', border: '1px solid rgba(2,74,221,.25)', borderRadius: 8, padding: '12px 14px',
          }}>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="SOP title, e.g. Short-Form Script Structure"
              style={{
                flex: '1 1 220px', boxSizing: 'border-box', font: "500 13.5px 'Inter Tight', sans-serif", color: '#111',
                padding: '9px 12px', border: '1px solid rgba(17,17,17,.15)', borderRadius: 6, background: '#fff', outline: 'none',
              }}
            />
            <button
              onClick={submitCreate}
              disabled={!newTitle.trim() || saving}
              style={{
                font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
                border: '1px solid transparent', background: '#024ADD', color: '#fff',
                opacity: !newTitle.trim() || saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => { setCreating(false); setNewTitle(''); setCreateErr(null); }}
              style={{
                font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
                border: '1px solid rgba(17,17,17,.15)', background: '#fff', color: '#111',
              }}
            >
              Cancel
            </button>
            {createErr && <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: '#b3261e' }}>{createErr}</span>}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {SOP_SYSTEMS.map((sys) => {
            const active = systemFilter.includes(sys);
            return (
              <button
                key={sys}
                onClick={() => toggleSystem(sys)}
                style={{
                  font: "700 11.5px 'Inter Tight', sans-serif", borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
                  border: active ? '1px solid #024ADD' : '1px solid rgba(17,17,17,.15)',
                  background: active ? 'rgba(2,74,221,.08)' : '#fff',
                  color: active ? '#024ADD' : 'rgba(17,17,17,.6)',
                }}
              >
                {sys}
              </button>
            );
          })}
        </div>

        {loading && <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading&hellip;</div>}

        {!loading && error && (
          <div style={{
            background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
            padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
          }}>
            Couldn&apos;t load the SOPs table ({error}). If this is a fresh install, migration{' '}
            <code className="mono">0022_sops.sql</code> may not be applied to the live database yet.
          </div>
        )}

        {!loading && !error && sops.length === 0 && (
          <div style={{
            border: '1px dashed rgba(17,17,17,.15)', borderRadius: 10, padding: '40px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
          }}>
            <div style={{ font: "700 15px 'Inter Tight', sans-serif", color: '#111' }}>No SOPs yet</div>
            <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', maxWidth: 420 }}>
              Create your first one when you&apos;re ready to hand a real process to someone.
            </div>
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                style={{
                  marginTop: 6, font: "700 12.5px 'Inter Tight', sans-serif", borderRadius: 8, padding: '10px 18px',
                  cursor: 'pointer', border: '1px solid transparent', background: '#024ADD', color: '#fff',
                }}
              >
                + New SOP
              </button>
            )}
          </div>
        )}

        {!loading && !error && sops.length > 0 && filtered.length === 0 && (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
            No SOPs match that search/filter.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {filtered.map((s) => <SopCard key={s.id} sop={s} skillSlug={s.skill_id ? skillSlugById.get(s.skill_id) ?? null : null} />)}
          </div>
        )}
      </div>
    </div>
  );
}
