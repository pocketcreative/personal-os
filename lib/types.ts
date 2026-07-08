export interface Task {
  id: string;
  title: string;
  description: string | null;
  urgency: 'today' | 'this_week' | 'this_month' | 'someday';
  key: boolean;
  priority_score: number;
  rank_pinned: boolean;
  time_estimate_min: number | null;
  actual_time_min: number;
  tags: string[];
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const URGENCIES = ['today', 'this_week', 'this_month', 'someday'] as const;
export const URGENCY_LABELS: Record<Task['urgency'], string> = {
  today: 'Today', this_week: 'This Week', this_month: 'This Month', someday: 'Someday',
};
