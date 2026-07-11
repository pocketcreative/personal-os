'use client';
import { useState } from 'react';
import { useMediaQuery } from '@/lib/useMediaQuery';
import TaskBoardDesktop from '@/components/tasks/TaskBoardDesktop';
import TaskBoardMobile from '@/components/tasks/TaskBoardMobile';
import SmartView from '@/components/tasks/SmartView';
import { fetchTasks, patchTask, deleteTask as deleteTaskApi, startTimer as startTimerApi } from '@/lib/clientTasks';
import type { Task } from '@/lib/types';
import { useEffect } from 'react';

const TABS = ['board', 'smart'] as const;
type Tab = (typeof TABS)[number];

/** Thin adapter so the unmodified SmartView (built against the legacy
 * fetchTasks('open')/patchTask/deleteTask/startTimer client helpers) keeps
 * working without changes — it only needs a task list + the same four
 * mutation callbacks it already expects. */
function SmartTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => { fetchTasks('open').then(setTasks); }, []);
  return (
    <SmartView
      tasks={tasks}
      onComplete={async (t) => { await patchTask(t.id, { completed_at: new Date().toISOString() } as Partial<Task>); setTasks((c) => c.filter((x) => x.id !== t.id)); }}
      onOpen={() => {}}
      onStartTimer={(t) => startTimerApi(t.id)}
    />
  );
}

export default function TasksPage() {
  const [tab, setTab] = useState<Tab>('board');
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 24px 0', background: '#f3f1ec' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
              font: "600 13px 'Inter Tight', sans-serif", textTransform: 'capitalize',
              background: tab === t ? '#fbfaf7' : 'transparent',
              color: tab === t ? '#111' : 'rgba(17,17,17,.5)',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'board'
        ? (isDesktop ? <TaskBoardDesktop /> : <TaskBoardMobile />)
        : <div style={{ padding: 24 }}><SmartTab /></div>}
    </div>
  );
}
