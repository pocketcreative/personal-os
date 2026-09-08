'use client';
import { useAgentRuns } from '@/lib/useAgentRuns';
import type { AgentRun } from '@/lib/types';
import { AGENT_RUN_STATUSES, AGENT_RUN_STATUS_LABELS } from '@/lib/types';

const COLUMN_WIDTH = 260;
const STATUS_DOT: Record<AgentRun['status'], string> = {
  running: '#eab308', blocked: '#b3261e', done: '#2f9e44', failed: '#b3261e',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function RunCard({ run, onDelete }: { run: AgentRun; onDelete: () => void }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(17,17,17,.08)', borderRadius: 8,
      padding: '12px 14px', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: run.summary ? 6 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[run.status], flexShrink: 0 }} />
          <span style={{ font: "600 14px 'Inter Tight', sans-serif", color: '#111' }}>{run.title}</span>
        </div>
        <span onClick={onDelete} title="Remove" style={{ cursor: 'pointer', color: 'rgba(17,17,17,.3)', fontSize: 14, flexShrink: 0 }}>×</span>
      </div>
      {run.summary && (
        <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.55)', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
          {run.summary}
        </div>
      )}
      <div style={{ font: "600 10px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.35)' }}>
        Updated {relativeTime(run.updated_at)}
      </div>
    </div>
  );
}

export default function AgentRunsBoard() {
  const { runs, deleteRun } = useAgentRuns();

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: 'clamp(24px, 6vw, 56px) clamp(8px, 2vw, 24px)', background: '#f3f1ec' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: 'clamp(20px, 5vw, 40px) clamp(10px, 3vw, 44px) 32px',
      }}>
        <div className="board-header" style={{ marginBottom: 28 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Agents</div>
          <div style={{
            font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
          {AGENT_RUN_STATUSES.map((status) => {
            const columnRuns = runs.filter((r) => r.status === status);
            return (
              <div key={status} style={{ flex: `0 0 ${COLUMN_WIDTH}px`, padding: 8 }}>
                <div style={{
                  font: "700 11px 'Archivo', sans-serif", color: 'rgba(17,17,17,.5)', letterSpacing: '.04em',
                  textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {AGENT_RUN_STATUS_LABELS[status]}
                  <span style={{ color: 'rgba(17,17,17,.3)', fontWeight: 600 }}>{columnRuns.length}</span>
                </div>
                {columnRuns.length === 0 && (
                  <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.3)' }}>Nothing here</div>
                )}
                {columnRuns.map((run) => (
                  <RunCard key={run.id} run={run} onDelete={() => deleteRun(run.id)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
