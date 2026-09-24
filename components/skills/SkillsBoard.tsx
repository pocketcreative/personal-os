'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSkills } from '@/lib/useSkills';
import { readTrigger } from '@/lib/skillFile';
import type { Skill } from '@/lib/types';

// Sync badge for a Tier A ("brendan") skill card -- everything it needs is
// already on the row, no filesystem access required (see 0020's comment on
// why Vercel can't hash the local file itself). "Edited since last sync"
// is inferred from updated_at moving past last_synced_at, not from a live
// hash compare.
function syncBadge(s: Skill): { text: string; color: string } {
  if (!s.sync_to_local) return { text: 'Library only', color: 'rgba(17,17,17,.4)' };
  if (!s.last_synced_at) return { text: 'Not yet synced', color: '#b3261e' };
  if (new Date(s.updated_at) > new Date(s.last_synced_at)) {
    return { text: 'Edited since last sync', color: '#9a7a2e' };
  }
  return { text: 'Synced', color: '#4b7a4f' };
}

function SkillCard({ skill, variant }: { skill: Skill; variant: 'own' | 'library' }) {
  const trigger = readTrigger(skill.content);
  const badge = variant === 'own' ? syncBadge(skill) : null;
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
          {badge ? badge.text : (skill.source === 'claude_ai' ? 'Owned by claude.ai' : 'Library')}
        </span>
      </div>
      <div style={{
        font: "500 12.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)', lineHeight: 1.45,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {trigger ?? <span style={{ color: 'rgba(17,17,17,.35)', fontStyle: 'italic' }}>No trigger description in frontmatter</span>}
      </div>
      <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
        v{skill.version} &middot; {skill.version_date}
      </div>
    </Link>
  );
}

export default function SkillsBoard({ variant }: { variant: 'own' | 'library' }) {
  const { skills, loading, error } = useSkills();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const inScope = skills.filter((s) => (variant === 'own' ? s.source === 'brendan' : s.source !== 'brendan'));
    const query = q.trim().toLowerCase();
    if (!query) return inScope;
    return inScope.filter((s) => s.slug.toLowerCase().includes(query) || s.content.toLowerCase().includes(query));
  }, [skills, variant, q]);

  const title = variant === 'own' ? 'Skills' : 'Skills Library';
  const subtitle = variant === 'own'
    ? "Your own skills, the ones you actually curate and use daily. Edit and save here, then sync writes the changes down to ~/.claude/skills."
    : 'Every other installed skill (claude.ai-managed and vendor/reference), so nothing is sitting somewhere you can’t see it. Read-only here -- claude.ai or the vendor stays the real owner, nothing syncs back to disk.';

  return (
    <div style={{ width: '96%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
      }}>
        <div className="board-header" style={{ marginBottom: 8 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>{title}</div>
          <Link
            href={variant === 'own' ? '/skills/library' : '/skills'}
            style={{
              font: "600 12px 'Inter Tight', sans-serif", color: '#9a7a2e', textDecoration: 'none',
              letterSpacing: '.02em',
            }}
          >
            {variant === 'own' ? `View full library →` : `← Back to your Skills`}
          </Link>
        </div>
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', marginBottom: 20, maxWidth: 720 }}>
          {subtitle}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by slug or content..."
          style={{
            width: '100%', boxSizing: 'border-box', font: "500 13.5px 'Inter Tight', sans-serif", color: '#111',
            padding: '10px 14px', border: '1px solid rgba(17,17,17,.12)', borderRadius: 8, background: '#fff',
            outline: 'none', marginBottom: 24,
          }}
        />

        {loading && <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading&hellip;</div>}

        {!loading && error && (
          <div style={{
            background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
            padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
          }}>
            Couldn&apos;t load the skills table ({error}). If this is a fresh install, migration{' '}
            <code className="mono">0020_skills_sops.sql</code> may not be applied to the live database yet.
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>
            {q ? 'No skills match that search.' : 'No skills imported yet.'}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {filtered.map((s) => <SkillCard key={s.id} skill={s} variant={variant} />)}
          </div>
        )}
      </div>
    </div>
  );
}
