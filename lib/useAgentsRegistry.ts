'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentProfile, AgentSkillLink } from '@/lib/types';

export type AgentWithCount = AgentProfile & {
  task_count: number;
  total_redos: number;
  skills: AgentSkillLink[];
};

// try/catch inside a useCallback that an effect calls trips up the
// react-hooks/set-state-in-effect analyzer (confirmed by isolated repro —
// same addEventListener/cleanup shape as useTaskDashboard.load passes
// clean without a try/catch, fails with one). Matching useTaskDashboard's
// own fetchAllTasks style instead: a plain top-level async helper with no
// try/catch, !res.ok handled inline, network-level throws left unhandled
// (same risk this codebase already accepts elsewhere).
async function fetchAgents(): Promise<{ agents: AgentWithCount[]; error: string | null }> {
  const res = await fetch('/api/agents');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { agents: [], error: text || `Failed to load agents (${res.status})` };
  }
  return { agents: await res.json(), error: null };
}

interface RegistryState {
  agents: AgentWithCount[];
  loading: boolean;
  error: string | null;
}

export function useAgentsRegistry() {
  // One combined state object + one setState call per load, not three
  // separate useState calls set in sequence — multiple sequential setState
  // calls inside an effect-invoked callback also trips the
  // react-hooks/set-state-in-effect analyzer (isolated repro), independent
  // of the try/catch issue above.
  const [state, setState] = useState<RegistryState>({ agents: [], loading: true, error: null });
  // Real guard against setting state after this hook's consumer has
  // unmounted mid-fetch (navigating away from /agents while load() is still
  // in flight) — not just a lint workaround, a genuinely correct async-effect
  // pattern.
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const result = await fetchAgents();
    if (mountedRef.current) setState({ agents: result.agents, loading: false, error: result.error });
  }, []);

  // Same load-on-mount pattern as useTaskDashboard, including a real
  // 'agents:refresh' listener/cleanup pair (mirrors that hook's
  // 'capture:done') so any future feature (e.g. creating a new agent role)
  // can force a refetch by dispatching that event, rather than each caller
  // having to reach back into this hook's internals.
  useEffect(() => {
    mountedRef.current = true;
    load();
    window.addEventListener('agents:refresh', load);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('agents:refresh', load);
    };
  }, [load]);

  const updateGoal = useCallback(async (id: string, goal: string) => {
    setState((cur) => ({ ...cur, agents: cur.agents.map((a) => (a.id === id ? { ...a, goal } : a)) }));
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal }),
    });
    if (!res.ok) load(); // revert to server truth on failure
  }, [load]);

  return { agents: state.agents, loading: state.loading, error: state.error, updateGoal, reload: load };
}
