'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAgentDetail } from '@/lib/useAgentDetail';
import { useSkills } from '@/lib/useSkills';
import { STATUS_LABELS } from '@/lib/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatMinutes(min: number): string {
  if (min <= 0) return 'not tracked';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const SECTION_LABEL: React.CSSProperties = {
  font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)',
  letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10,
};
const CHIP: React.CSSProperties = {
  font: "600 12px 'Inter Tight', sans-serif", color: '#9a7a2e', background: 'rgba(198,161,91,.14)',
  border: '1px solid rgba(198,161,91,.4)', borderRadius: 20, padding: '5px 10px 5px 12px',
  display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
};
const TOOL_CHIP: React.CSSProperties = {
  font: "600 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)', background: 'rgba(17,17,17,.05)',
  borderRadius: 20, padding: '5px 10px 5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6,
};

function GoalField({ goal, onSave }: { goal: string; onSave: (goal: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal);
  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== goal) onSave(trimmed);
  };
  if (editing) {
    return (
      <textarea
        autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(goal); setEditing(false); } }}
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
      onClick={() => { setDraft(goal); setEditing(true); }}
      style={{
        font: "500 14px 'Inter Tight', sans-serif", lineHeight: 1.5, cursor: 'text',
        color: goal ? 'rgba(17,17,17,.75)' : 'rgba(17,17,17,.35)', padding: '2px 0', minHeight: 21,
      }}
      title="Click to edit"
    >
      {goal || 'Click to set a goal…'}
    </div>
  );
}

export default function AgentDetail({ id }: { id: string }) {
  const { agent, loading, error, updateGoal, updateTools, addSkill, removeSkill } = useAgentDetail(id);
  const { skills: allSkills } = useSkills();
  const [toolDraft, setToolDraft] = useState('');
  const [addSkillOpen, setAddSkillOpen] = useState(false);

  if (loading) return <Wrap><div style={muted}>Loading…</div></Wrap>;
  if (error || !agent) return <Wrap><div style={errStyle}>{error ?? 'Not found'}</div></Wrap>;

  const linkableSkills = allSkills
    .filter((s) => s.status === 'active' && !agent.skills.some((linked) => linked.id === s.id))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const addTool = () => {
    const t = toolDraft.trim();
    if (t && !agent.tools.includes(t)) updateTools([...agent.tools, t]);
    setToolDraft('');
  };
  const removeTool = (t: string) => updateTools(agent.tools.filter((x) => x !== t));

  return (
    <Wrap>
      <Link href="/agents" style={{ font: "600 12px 'Inter Tight', sans-serif", color: '#9a7a2e', textDecoration: 'none' }}>
        &larr; Agents
      </Link>
      <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em', margin: '4px 0 24px' }}>
        {agent.name}
      </div>

      <div style={SECTION_LABEL}>Goal</div>
      <div style={{ marginBottom: 24 }}>
        <GoalField goal={agent.goal} onSave={updateGoal} />
      </div>

      <div style={SECTION_LABEL}>Skills</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {agent.skills.length === 0 && <div style={{ ...muted, marginBottom: 0 }}>No skills linked yet.</div>}
        {agent.skills.map((s) => (
          <span key={s.id} style={CHIP}>
            <Link href={`/skills/${s.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s.slug}</Link>
            <span onClick={() => removeSkill(s.id)} style={{ cursor: 'pointer', opacity: 0.6 }} title="Unlink">✕</span>
          </span>
        ))}
      </div>
      {addSkillOpen ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) { addSkill(e.target.value); setAddSkillOpen(false); } }}
            style={{
              flex: '1 1 200px', fontSize: 13, color: '#111', padding: '8px 10px',
              border: '1px solid rgba(17,17,17,.15)', borderRadius: 6, background: '#fff',
              fontFamily: "'Inter Tight', sans-serif", outline: 'none',
            }}
          >
            <option value="" disabled>Choose a skill…</option>
            {linkableSkills.map((s) => <option key={s.id} value={s.id}>{s.slug}</option>)}
          </select>
          <button onClick={() => setAddSkillOpen(false)} style={btnSecondary}>Cancel</button>
        </div>
      ) : (
        <div onClick={() => setAddSkillOpen(true)} style={{ cursor: 'pointer', font: "600 12px 'Inter Tight', sans-serif", color: '#9a7a2e', marginBottom: 24 }}>
          + Link a skill
        </div>
      )}

      <div style={SECTION_LABEL}>Tools</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {agent.tools.length === 0 && <div style={{ ...muted, marginBottom: 0 }}>No tools listed yet.</div>}
        {agent.tools.map((t) => (
          <span key={t} style={TOOL_CHIP}>
            {t}
            <span onClick={() => removeTool(t)} style={{ cursor: 'pointer', opacity: 0.6 }} title="Remove">✕</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        <input
          value={toolDraft} onChange={(e) => setToolDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTool(); } }}
          placeholder="Add a tool…"
          style={{
            flex: 1, fontSize: 13, color: '#111', padding: '8px 12px',
            border: '1px solid rgba(17,17,17,.1)', borderRadius: 6, background: '#fff',
            boxSizing: 'border-box', fontFamily: "'Inter Tight', sans-serif", outline: 'none',
          }}
        />
        <button onClick={addTool} style={btnSecondary}>Add</button>
      </div>

      <div style={SECTION_LABEL}>How It Remembers</div>
      <div style={{
        font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)', lineHeight: 1.6,
        marginBottom: 24, maxWidth: 640,
      }}>
        A role, not a running bot. Each task starts a fresh agent that reads the Skills linked above
        and Brendan&apos;s memory. There&apos;s no separate private memory store for this role --
        what it knows is exactly what&apos;s in its Skills, plus the retrospective feed below, which
        is how a lesson from a real task makes it back into a Skill.
      </div>

      <div style={SECTION_LABEL}>Task History</div>
      <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.55)', marginBottom: 12 }}>
        {agent.summary.completed_count} completed
        {agent.summary.median_time_min !== null && ` · median ${formatMinutes(agent.summary.median_time_min)}`}
        {` · ${agent.summary.total_redos} ${agent.summary.total_redos === 1 ? 'redo' : 'redos'}`}
      </div>
      {agent.history.length === 0 ? (
        <div style={{ ...muted, marginBottom: 24 }}>No tasks tagged to this agent yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 24 }}>
          {agent.history.map((t) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '9px 4px', borderBottom: '1px solid rgba(17,17,17,.06)',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  font: "600 13.5px 'Inter Tight', sans-serif", color: '#111',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.title}
                </div>
                <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.45)', marginTop: 2 }}>
                  {STATUS_LABELS[t.status]}
                  {t.completed_at && ` · ${formatDate(t.completed_at)}`}
                  {t.restart_count > 0 && ` · ${t.restart_count} ${t.restart_count === 1 ? 'redo' : 'redos'}`}
                </div>
              </div>
              <div style={{ font: "600 12.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', flexShrink: 0 }}>
                {formatMinutes(t.actual_time_min)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={SECTION_LABEL}>Retrospectives</div>
      {agent.retrospectives.length === 0 ? (
        <div style={muted}>No retrospectives logged yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {agent.retrospectives.map((r) => (
            <div key={r.id} style={{
              border: '1px solid rgba(17,17,17,.08)', borderRadius: 8, padding: '12px 14px', background: '#fff',
            }}>
              <div style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginBottom: 6 }}>
                {formatDate(r.created_at)}
                {r.applied_to && r.applied_to !== 'none' && ` · applied to ${r.applied_to}${r.applied_ref ? ` (${r.applied_ref})` : ''}`}
              </div>
              {r.went_wrong && (
                <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: '#111', marginBottom: 4 }}>
                  <strong>Went wrong:</strong> {r.went_wrong}
                </div>
              )}
              {r.went_well && (
                <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: '#111' }}>
                  <strong>Went well:</strong> {r.went_well}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: '96%', maxWidth: 760, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) 0' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(18px, 3vw, 44px) 32px',
      }}>
        {children}
      </div>
    </div>
  );
}

const muted: React.CSSProperties = { font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', marginBottom: 24 };
const errStyle: React.CSSProperties = {
  background: 'rgba(179,38,30,.06)', border: '1px solid rgba(179,38,30,.25)', borderRadius: 8,
  padding: '14px 16px', font: "500 13px 'Inter Tight', sans-serif", color: '#8a2a22',
};
const btnSecondary: React.CSSProperties = {
  font: "600 12.5px 'Inter Tight', sans-serif", background: '#fff', color: '#111',
  border: '1px solid rgba(17,17,17,.15)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
};
