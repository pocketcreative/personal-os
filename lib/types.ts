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

// '' (blank) means "Brendan" implicitly — his own tasks don't get an owner
// label at all, only named others (a teammate, or "ai" for Claude/a
// sub-agent) show up, so the column stays quiet except when it's telling you
// something. `owner: string` on Task can hold ANY name (e.g. 'azel',
// 'fahad'), typed via the task detail view — KNOWN_OWNERS is just the quick
// pick list in the row popover, not an exhaustive/enforced set.
export const KNOWN_OWNERS = ['', 'ai'] as const;
export const OWNER_LABELS: Record<string, string> = {
  '': 'Brendan', ai: 'AI',
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

export type ContentFormat = 'long_form' | 'short_form' | 'lts' | 'carousel' | 'ad' | 'vsl';

export interface ContentPiece {
  id: string;
  title: string;
  visual_hook: string | null;
  script: string | null; // what was written beforehand
  transcript: string | null; // what was actually said in the finished video
  status: 'draft' | 'ready_to_record' | 'editing' | 'ready_to_post' | 'scheduled';
  format: ContentFormat | null; // null = not categorised yet (a freshly typed card)
  platform: string[];
  target_post_date: string | null;
  raw_footage_link: string | null;
  video_link: string | null; // the working video file (a Drive /preview URL embeds as a player)
  posted_link: string | null; // the live public post, once it's out
  additional_footage: string | null;
  sort_order: number | null; // null = never manually dragged; falls back to created_at order
  created_at: string;
  updated_at: string;
  // Derived server-side from content_comments on every GET, never stored on
  // the row. A piece "needs re-edit" exactly when it still has an unresolved
  // comment, so no flag can drift out of sync with the thread it reports on.
  comment_count: number;
  unresolved_comment_count: number;
}

export const CONTENT_STATUSES = ['draft', 'ready_to_record', 'editing', 'ready_to_post', 'scheduled'] as const;
export const CONTENT_STATUS_LABELS: Record<ContentPiece['status'], string> = {
  draft: 'Draft', ready_to_record: 'Ready To Record', editing: 'Editing',
  ready_to_post: 'Ready To Post', scheduled: 'Scheduled',
};

export const CONTENT_FORMATS = ['long_form', 'short_form', 'lts', 'carousel', 'ad', 'vsl'] as const;
export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  long_form: 'Long-form', short_form: 'Short-form', lts: 'LTS',
  carousel: 'Carousel', ad: 'AD', vsl: 'VSL',
};

// A review note left on a piece. Unresolved notes are what the "Needs
// re-edit" badge reports, and together they're the brief for the next
// reel-editor / reel-cutter pass.
export interface ContentComment {
  id: string;
  piece_id: string;
  author: string; // free text, same convention as tasks.owner ('brendan', an agent name)
  body: string;
  video_timestamp_seconds: number | null; // the moment in the video this refers to, if any
  resolved: boolean;
  created_at: string;
}

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

export interface OutreachLead {
  id: string;
  rank: number | null;
  cea_no: string;
  name: string;
  company: string | null;
  mobile: string | null;
  email: string | null;
  resale_deals: number;
  new_sale_deals: number;
  whole_rental_deals: number;
  room_rental_deals: number;
  total_deals_2025: number;
  est_income: number | null;
  contact_status: 'not_contacted' | 'sent' | 'replied' | 'no_reply';
  created_at: string;
  updated_at: string;
}

export const OUTREACH_STATUSES = ['not_contacted', 'sent', 'replied', 'no_reply'] as const;
export const OUTREACH_STATUS_LABELS: Record<OutreachLead['contact_status'], string> = {
  not_contacted: 'Not Contacted', sent: 'Sent', replied: 'Replied', no_reply: 'No Reply',
};

export interface OutreachMessage {
  id: string;
  lead_id: string;
  direction: 'outbound' | 'inbound';
  content: string;
  is_ai_suggested: boolean;
  ai_suggestion_original: string | null;
  created_at: string;
}
