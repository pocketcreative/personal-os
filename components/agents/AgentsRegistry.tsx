'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAgentsRegistry, type AgentWithCount } from '@/lib/useAgentsRegistry';

const CHIP_STYLE: React.CSSProperties = {
  font: "600 11px 'Inter Tight', sans-serif", color: '#9a7a2e',
  background: 'rgba(198,161,91,.12)', border: '1px solid rgba(198,161,91,.3)',
  borderRadius: 20, padding: '4px 10px', textDecoration: 'none', display: 'inline-block',
};
const TOOL_CHIP_STYLE: React.CSSProperties = {
  font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)',
  background: 'rgba(17,17,17,.05)', borderRadius: 20, padding: '4px 10px', display: 'inline-block',
};

// Simple edit-in-place for `goal` — same click-to-edit convention used by
// OwnerCell/AddTaskInput elsewhere in this app: a plain block until clicked,
// then a real <textarea>, committed on blur.
function GoalField({ agent, onSave }: { agent: AgentWithCount; onSave: (goal: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(agent.goal);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== agent.goal) onSave(trimmed);
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setDraft(agent.goal); setEditing(false); }
        }}
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.5, color: '#111',
          padding: '10px 12px', border: '1px solid rgba(154,122,46,.4)', borderRadius: 6,
          background: '#fff', fontFamily: "'Inter Tight', sans-serif", resize: 'vertical', outline: 'none',
        }}
      />
    );
  }

  return (
    <div
      onClick={() => { setDraft(agent.goal); setEditing(true); }}
      style={{
        font: "500 14px 'Inter Tight', sans-serif", lineHeight: 1.5, cursor: 'text',
        color: agent.goal ? 'rgba(17,17,17,.75)' : 'rgba(17,17,17,.35)',
        padding: '2px 0', minHeight: 21,
      }}
      title="Click to edit"
    >
      {agent.goal || 'Click to set a goal…'}
    </div>
  );
}

function AgentCard({ agent, onSaveGoal }: { agent: AgentWithCount; onSaveGoal: (goal: string) => void }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(17,17,17,.08)', borderRadius: 10,
      padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <Link href={`/agents/${agent.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ font: "700 15.5px 'Inter Tight', sans-serif", color: '#111', letterSpacing: '-0.01em' }}>
            {agent.name}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{
              font: "700 11px 'Archivo', sans-serif", color: '#9a7a2e',
              background: 'rgba(198,161,91,.14)', borderRadius: 20, padding: '4px 10px', whiteSpace: 'nowrap',
            }}>
              {agent.task_count} {agent.task_count === 1 ? 'task' : 'tasks'}
            </span>
            {agent.total_redos > 0 && (
              <span style={{
                font: "700 10px 'Archivo', sans-serif", color: '#c0392b',
                background: 'rgba(192,57,43,.1)', borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
              }}>
                {agent.total_redos} {agent.total_redos === 1 ? 'redo' : 'redos'}
              </span>
            )}
          </div>
        </div>
      </Link>

      {agent.skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {agent.skills.map((s) => (
            <Link key={s.id} href={`/skills/${s.slug}`} style={CHIP_STYLE}>{s.slug}</Link>
          ))}
        </div>
      )}
      {agent.tools.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {agent.tools.map((t) => <span key={t} style={TOOL_CHIP_STYLE}>{t}</span>)}
        </div>
      )}

      <div style={{
        font: "700 10px 'Archivo', sans-serif", color: 'rgba(17,17,17,.35)', letterSpacing: '.06em',
        textTransform: 'uppercase', marginTop: 4,
      }}>
        Goal
      </div>
      <GoalField agent={agent} onSave={onSaveGoal} />
    </div>
  );
}

export default function AgentsRegistry() {
  const { agents, loading, error, updateGoal } = useAgentsRegistry();

  return (
    <div style={{ width: '96%', maxWidth: 1220, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
      }}>
        <div className="board-header" style={{ marginBottom: 8 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Agents</div>
          <div style={{
            font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
        <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', marginBottom: 28 }}>
          Every agent role on the team, what it&apos;s optimizing for, and how many open tasks it&apos;s carrying right now.
        </div>

        {loading && (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>Loading…</div>
        )}

        {!loading && error && (
          <div style={{
            background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
            padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
          }}>
            Couldn&apos;t load the agents table ({error}). If this is a fresh install, migration{' '}
            <code className="mono">0018_agents_registry.sql</code> may not be applied to the live database yet.
          </div>
        )}

        {!loading && !error && (
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}>
            {agents.map((a) => (
              <AgentCard key={a.id} agent={a} onSaveGoal={(goal) => updateGoal(a.id, goal)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
