'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentProfile, AgentSkillLink, AgentTaskHistoryItem, Retrospective } from '@/lib/types';

export interface AgentDetail extends AgentProfile {
  skills: AgentSkillLink[];
  history: AgentTaskHistoryItem[];
  summary: { completed_count: number; median_time_min: number | null; total_redos: number };
  retrospectives: Retrospective[];
}

async function fetchAgent(id: string): Promise<{ agent: AgentDetail | null; error: string | null }> {
  const res = await fetch(`/api/agents/${id}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { agent: null, error: text || `Failed to load agent (${res.status})` };
  }
  return { agent: await res.json(), error: null };
}

export function useAgentDetail(id: string) {
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (mountedRef.current) setLoading(true);
    const result = await fetchAgent(id);
    if (mountedRef.current) { setAgent(result.agent); setError(result.error); setLoading(false); }
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const updateGoal = useCallback(async (goal: string) => {
    setAgent((cur) => (cur ? { ...cur, goal } : cur));
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal }),
    });
    if (!res.ok) load();
  }, [id, load]);

  const updateTools = useCallback(async (tools: string[]) => {
    setAgent((cur) => (cur ? { ...cur, tools } : cur));
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tools }),
    });
    if (!res.ok) load();
  }, [id, load]);

  const addSkill = useCallback(async (skillId: string) => {
    const res = await fetch(`/api/agents/${id}/skills`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skill_id: skillId }),
    });
    if (res.ok) load();
  }, [id, load]);

  const removeSkill = useCallback(async (skillId: string) => {
    setAgent((cur) => (cur ? { ...cur, skills: cur.skills.filter((s) => s.id !== skillId) } : cur));
    const res = await fetch(`/api/agents/${id}/skills?skill_id=${encodeURIComponent(skillId)}`, { method: 'DELETE' });
    if (!res.ok) load();
  }, [id, load]);

  return { agent, loading, error, updateGoal, updateTools, addSkill, removeSkill, reload: load };
}
