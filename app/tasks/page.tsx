'use client';
import { useMediaQuery } from '@/lib/useMediaQuery';
import TaskBoardDesktop from '@/components/tasks/TaskBoardDesktop';
import TaskBoardMobile from '@/components/tasks/TaskBoardMobile';

export default function TasksPage() {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  return (
    <div>
      {isDesktop ? <TaskBoardDesktop /> : <TaskBoardMobile />}
    </div>
  );
}
