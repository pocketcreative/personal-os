export interface ActiveTimerSession {
  id: string;
  started_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  urgency: 'today' | 'this_week' | 'this_month' | 'someday'; // legacy, unused by the new UI
  key: boolean; // reused as the new binary priority: true = "TODAY"
  category: 'personal' | 'business';
  status: 'not_started' | 'in_progress' | 'completed' | 'archived';
  priority_score: number; // legacy, unused by the new UI
  rank_pinned: boolean; // legacy, unused by the new UI
  time_estimate_min: number | null;
  actual_time_min: number;
  sort_order: number | null; // null = never manually dragged; use taskSort.ts's fixed rank() rule
  tags: string[];
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  active_timer: ActiveTimerSession | null;
  owner: string; // free text: 'brendan', 'ai', or a named team member (e.g. 'fahad')
  needs_input: boolean; // true = blocked waiting on Brendan, shows a warning badge
  input_note: string | null; // what's needed from Brendan when needs_input is true
}

export const KNOWN_OWNERS = ['brendan', 'ai'] as const;
export const OWNER_LABELS: Record<string, string> = {
  brendan: 'Brendan', ai: 'AI',
};

export const CATEGORIES = ['personal', 'business'] as const;
export const CATEGORY_LABELS: Record<Task['category'], string> = {
  personal: 'Personal', business: 'Business',
};

export const STATUSES = ['not_started', 'in_progress', 'completed', 'archived'] as const;
export const STATUS_LABELS: Record<Task['status'], string> = {
  not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', archived: 'Archived',
};

export interface Idea {
  id: string;
  text: string;
  used: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContentPiece {
  id: string;
  title: string;
  visual_hook: string | null;
  script: string | null;
  status: 'draft' | 'ready_to_record' | 'editing' | 'ready_to_post' | 'scheduled';
  platform: string[];
  target_post_date: string | null;
  raw_footage_link: string | null;
  additional_footage: string | null;
  sort_order: number | null; // null = never manually dragged; falls back to created_at order
  created_at: string;
  updated_at: string;
}

export const CONTENT_STATUSES = ['draft', 'ready_to_record', 'editing', 'ready_to_post', 'scheduled'] as const;
export const CONTENT_STATUS_LABELS: Record<ContentPiece['status'], string> = {
  draft: 'Draft', ready_to_record: 'Ready To Record', editing: 'Editing',
  ready_to_post: 'Ready To Post', scheduled: 'Scheduled',
};

export interface AgentRun {
  id: string;
  title: string;
  status: 'running' | 'blocked' | 'done' | 'failed';
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export const AGENT_RUN_STATUSES = ['running', 'blocked', 'done', 'failed'] as const;
export const AGENT_RUN_STATUS_LABELS: Record<AgentRun['status'], string> = {
  running: 'Running', blocked: 'Needs Input', done: 'Done', failed: 'Failed',
};
