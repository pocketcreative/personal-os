'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSkills, searchSkills } from '@/lib/useSkills';
import { SOP_SYSTEMS, type SkillListItem, type SkillSource, type SopSystem } from '@/lib/types';
import SkillsAreaNav from '@/components/skills/SkillsAreaNav';

// Fix 1: Skills and the old Skills Library are one page now, split by a
// filter chip row instead of two routes. 'all' has no ?filter param so the
// plain /skills URL stays the default/bookmarkable view.
type FilterKey = 'all' | SkillSource;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'brendan', label: 'Mine' },
  { key: 'vendor', label: 'Vendor' },
];

// Sync badge for a Tier A ("brendan") skill card -- everything it needs is
// already on the row, no filesystem access required (see 0020's comment on
// why Vercel can't hash the local file itself). "Edited since last sync"
// is inferred from updated_at moving past last_synced_at, not from a live
// hash compare.
function syncBadge(s: SkillListItem): { text: string; color: string } {
  if (!s.sync_to_local) return { text: 'Not synced', color: 'rgba(17,17,17,.4)' };
  if (!s.last_synced_at) return { text: 'Not yet synced', color: '#b3261e' };
  if (new Date(s.updated_at) > new Date(s.last_synced_at)) {
    return { text: 'Edited since last sync', color: '#9a7a2e' };
  }
  return { text: 'Synced', color: '#4b7a4f' };
}

const chip: React.CSSProperties = {
  font: "700 10.5px 'Archivo', sans-serif", color: '#024ADD',
  background: 'rgba(2,74,221,.08)', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
};

function SkillCard({ skill }: { skill: SkillListItem }) {
  const badge = skill.source === 'brendan' ? syncBadge(skill) : null;
  return (
    <Link
      href={`/skills/${encodeURIComponent(skill.slug)}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none',
        background: '#fff', border: '1px solid rgba(17,17,17,.08)', borderRadius: 10,
        padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ font: "700 15px 'Inter Tight', sans-serif", color: '#111', letterSpacing: '-0.01em' }}>
          {skill.slug}
        </div>
        <span style={{
          flexShrink: 0, font: "700 10.5px 'Archivo', sans-serif", color: badge?.color ?? '#9a7a2e',
          background: 'rgba(154,122,46,.10)', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
        }}>
          {badge ? badge.text : 'Library'}
        </span>
      </div>
      <div style={{
        font: "500 12.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)', lineHeight: 1.45,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {skill.trigger_description ?? <span style={{ color: 'rgba(17,17,17,.35)', fontStyle: 'italic' }}>No trigger description in frontmatter</span>}
      </div>
      {(skill.systems ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {skill.systems.map((s) => <span key={s} style={chip}>{s}</span>)}
        </div>
      )}
      <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
        v{skill.version} &middot; {skill.version_date}
      </div>
    </Link>
  );
}

export default function SkillsBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFilter = searchParams.get('filter');
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as FilterKey) : 'all';

  const { skills, loading, error } = useSkills();
  const [q, setQ] = useState('');
  const [systemFilter, setSystemFilter] = useState<SopSystem[]>([]);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [searchResults, setSearchResults] = useState<SkillListItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounced server-side search (Fix 2): fires ~300ms after typing stops,
  // not on every keystroke, and only when there's an actual query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const runSearch = useCallback(async (query: string) => {
    if (!query) { setSearchResults(null); setSearchError(null); setSearching(false); return; }
    setSearching(true);
    try {
      const r = await searchSkills(query);
      setSearchResults(r);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional, same load-effect pattern as lib/useReflections.ts/useSkills.ts
  useEffect(() => { runSearch(debouncedQ); }, [debouncedQ, runSearch]);

  const setFilter = (key: FilterKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'all') params.delete('filter'); else params.set('filter', key);
    const qs = params.toString();
    router.replace(qs ? `/skills?${qs}` : '/skills', { scroll: false });
  };

  const filtered = useMemo(() => {
    const source = debouncedQ ? (searchResults ?? []) : skills;
    return source.filter((s) => {
      if (filter !== 'all' && s.source !== filter) return false;
      if (systemFilter.length > 0 && !systemFilter.some((f) => (s.systems ?? []).includes(f))) return false;
      return true;
    });
  }, [debouncedQ, searchResults, skills, filter, systemFilter]);

  const toggleSystem = (sys: SopSystem) => {
    setSystemFilter((prev) => (prev.includes(sys) ? prev.filter((s) => s !== sys) : [...prev, sys]));
  };

  const isLoading = debouncedQ ? searching : loading;
  const activeError = debouncedQ ? searchError : error;

  return (
    <div style={{ width: '96%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
      }}>
        <SkillsAreaNav />
        <div className="board-header" style={{ marginBottom: 8 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Skills</div>
        </div>
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', marginBottom: 20, maxWidth: 720 }}>
          Everything installed, yours and everyone else&apos;s. Edit and save your own here, then sync writes the changes down to ~/.claude/skills. Vendor skills are library/reference -- nothing here writes back to their real source.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  font: "700 12px 'Inter Tight', sans-serif",
                  color: active ? '#fff' : '#111',
                  background: active ? '#024ADD' : '#fff',
                  border: `1px solid ${active ? '#024ADD' : 'rgba(17,17,17,.15)'}`,
                  borderRadius: 20, padding: '6px 14px', cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by slug or content..."
          style={{
            width: '100%', boxSizing: 'border-box', font: "500 13.5px 'Inter Tight', sans-serif", color: '#111',
            padding: '10px 14px', border: '1px solid rgba(17,17,17,.12)', borderRadius: 8, background: '#fff',
            outline: 'none', marginBottom: 16,
          }}
        />

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

        {isLoading && <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading&hellip;</div>}

        {!isLoading && activeError && (
          <div style={{
            background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
            padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
          }}>
            Couldn&apos;t load the skills table ({activeError}). If this is a fresh install, migration{' '}
            <code className="mono">0020_skills_sops.sql</code> may not be applied to the live database yet.
          </div>
        )}

        {!isLoading && !activeError && filtered.length === 0 && (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
            {q || systemFilter.length > 0 ? 'No skills match that search/filter.' : 'No skills imported yet.'}
          </div>
        )}

        {!isLoading && !activeError && filtered.length > 0 && (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {filtered.map((s) => <SkillCard key={s.id} skill={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
