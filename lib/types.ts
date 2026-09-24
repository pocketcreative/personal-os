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
  agent_tags: string[]; // which agent role(s) this task is assigned to -- separate from `owner` (a single identity); a task can carry more than one
  task_type: 'single' | 'scheduled'; // 'scheduled' = a recurring automation; each firing is its own new row, not one row cycling forever
  // Running problem -> options considered -> recommended solution log, same
  // pattern used in Telegram when working through open decisions on a task.
  // Nullable markdown text, distinct from `description` (migration 0021).
  decisions_log: string | null;
  // How many times this task has been sent back from Needs Review (migration
  // 0023). Incremented by POST /api/tasks/[id]/send-back, the mechanism for
  // tracking when an agent's work gets rejected/redone (M8).
  restart_count: number;
}

// Seed list shown in the Agents Assigned picker -- free text is still
// allowed (agent_tags is a plain text[] column, not a DB enum) so a new role
// can be tagged without a migration, this is just the quick-pick list.
export const AGENT_TAGS = [
  'Copywriter Agent',
  'Developer Agent',
  'Long Form Editor Agent',
  'Short Form/Reel Editor Agent',
  'Motion Graphics Agent',
  'Ops/Research Agent',
  'Brendan',
] as const;

export const TASK_TYPES = ['single', 'scheduled'] as const;
export const TASK_TYPE_LABELS: Record<Task['task_type'], string> = {
  single: 'Single', scheduled: 'Scheduled',
};

// The 5 explicit stages shown in the task detail view and each now its own
// kanban column, in this order. needs_input wins over status: a completed
// or archived task that's still flagged needs_input shows in Needs Review,
// not Completed/Archived, until Brendan clears the flag.
export type TaskStage = 'not_started' | 'in_progress' | 'needs_review' | 'completed' | 'archived';
export const STAGE_LABELS: Record<TaskStage, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', needs_review: 'Needs Review',
  completed: 'Completed', archived: 'Archived',
};

export function taskStage(t: Pick<Task, 'status' | 'needs_input'>): TaskStage {
  if (t.needs_input) return 'needs_review';
  if (t.status === 'completed') return 'completed';
  if (t.status === 'archived') return 'archived';
  if (t.status === 'not_started') return 'not_started';
  return 'in_progress';
}

export type KanbanColumn = TaskStage;
export const KANBAN_COLUMNS: KanbanColumn[] = ['not_started', 'in_progress', 'needs_review', 'completed', 'archived'];
export const KANBAN_COLUMN_LABELS: Record<KanbanColumn, string> = STAGE_LABELS;
export function kanbanColumn(t: Pick<Task, 'status' | 'needs_input'>): KanbanColumn {
  return taskStage(t);
}

// The inverse of kanbanColumn()/taskStage() above: given a column a card was
// dropped into, the status/needs_input patch that actually produces
// membership in that column. needs_review is the odd one out — it's driven
// purely by needs_input (status is left alone, matching taskStage()'s "needs
// input wins" rule), every other column sets needs_input back to false so a
// card dragged back out of Needs Review clears the flag.
export function columnPatch(col: KanbanColumn): Pick<Partial<Task>, 'status' | 'needs_input'> {
  if (col === 'needs_review') return { needs_input: true };
  return { status: col, needs_input: false };
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

export const URGENCIES = ['today', 'this_week', 'this_month', 'someday'] as const;
export const URGENCY_LABELS: Record<Task['urgency'], string> = {
  today: 'Today', this_week: 'This Week', this_month: 'This Month', someday: 'Someday',
};

// Local (not UTC) "today" as YYYY-MM-DD, matching due_date's own plain-date
// column (no time component) -- shared so every "due soon" check agrees on
// what day it is regardless of timezone offset.
export function todayLocalISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// The single "needs attention soon" rule, shared by the Prioritise badge
// (kanban cards + detail modal) and the Needs Attention Soon widget so both
// always agree: urgency flagged 'today', or due today through 3 days out.
// Collapses the old 4-value urgency display down to this one binary signal
// -- urgency itself is untouched on the record, this only governs what
// gets shown. A completed/archived task never needs attention, regardless
// of its due date.
export function needsPrioritise(t: Pick<Task, 'urgency' | 'due_date' | 'status'>): boolean {
  if (t.status === 'completed' || t.status === 'archived') return false;
  if (t.urgency === 'today') return true;
  if (!t.due_date) return false;
  const today = todayLocalISO();
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() + 3);
  const cutoffISO = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  return t.due_date >= today && t.due_date <= cutoffISO;
}

// One row per agent ROLE (the Agents Registry, `/agents`) -- distinct from
// AgentRun (a live log of individual sub-agent invocations, `agent_runs`)
// and from Task.agent_tags (which roles a given task is assigned to).
// task_count is derived server-side from OPEN tasks (not completed/archived)
// whose agent_tags includes this agent's name, never stored on the row.
export interface AgentProfile {
  id: string;
  name: string;
  skill_name: string;
  goal: string;
  tools: string[];
  created_at: string;
  updated_at: string;
}

// A Skill linked to an agent, shown as a chip on the card/detail page and
// linking to /skills/[slug]. Deliberately just the fields the chip needs,
// not the full Skill row (content, etc.).
export interface AgentSkillLink {
  id: string;
  slug: string;
  version: string;
}

// Extra fields the /agents/[id] detail page needs beyond the list card.
// Deliberately simple per the "no over-engineering" rule: numbers and a
// list, not a scoring dashboard -- no charts, no uptime indicators.
export interface AgentTaskHistoryItem {
  id: string;
  title: string;
  status: Task['status'];
  completed_at: string | null;
  actual_time_min: number; // this agent's own tracked time on this task (0 = not tracked), see agents/[id] route for the attribution rule
  restart_count: number;
}

export interface Retrospective {
  id: string;
  task_id: string | null;
  agent_names: string[];
  skill_id: string | null;
  went_wrong: string | null;
  went_well: string | null;
  applied_to: 'skill' | 'memory' | 'claude_md' | 'none' | null;
  applied_ref: string | null;
  created_at: string;
}

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
  script: string | null; // what's said/filmed -- written beforehand or transcribed after, whichever is real
  caption: string | null; // the actual platform post copy (IG/TikTok/YouTube caption box), distinct from the script
  status: 'draft' | 'ready_to_record' | 'editing' | 'ready_to_post' | 'scheduled';
  format: ContentFormat | null; // null = not categorised yet (a freshly typed card)
  platform: string[];
  target_post_date: string | null;
  raw_footage_link: string | null;
  thumbnail_link: string | null;
  video_link: string | null; // the working video file (a Drive /preview URL embeds as a player)
  posted_link: string | null; // the live public post, once it's out
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

// Skills library (`/skills`, `/skills/library`), Phase 2 Part A. Stored
// VERBATIM -- `content` is the exact bytes of the local SKILL.md
// (frontmatter included). No template, no extracted fields; the trigger
// text is read out of the frontmatter at display time (lib/skillFile.ts
// readTrigger), not duplicated into its own column.
export type SkillSource = 'brendan' | 'claude_ai' | 'vendor';

export interface Skill {
  id: string;
  user_id: string;
  slug: string;
  content: string;
  version: string;
  version_date: string;
  // true only for Brendan's own "Tier A" skills -- these sync bidirectionally
  // with ~/.claude/skills/<slug>/SKILL.md via scripts/sync-skills.mjs.
  sync_to_local: boolean;
  // Who owns the canonical copy: 'brendan' (Tier A, editable + synced here),
  // 'claude_ai' (owned by claude.ai, library-only), 'vendor' (every other
  // installed skill -- addyosmani pack, hyperframes, remotion, humanizer,
  // etc. -- library-only).
  source: SkillSource;
  synced_hash: string | null;
  last_synced_at: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  brendan: 'Your skill', claude_ai: 'Owned by claude.ai', vendor: 'Library',
};

// SOPs (`/skills/sops`), Phase 2 Part B. Human-facing process documents --
// distinct from Skills (agent files, stored verbatim). Written to the
// 7-section template: Title / Date & Version / Goal / Principles / Steps /
// Example / Checklist. `example` is nullable -- the UI shows it blank as a
// placeholder, the downloaded MD omits the heading entirely when blank (Q9).
export const SOP_SYSTEMS = [
  'Strategy', 'Differentiation', 'Interest', 'Trust', 'Pre Frame', 'Revival', 'Data', 'Team',
] as const;
export type SopSystem = (typeof SOP_SYSTEMS)[number];

export interface Sop {
  id: string;
  user_id: string;
  title: string;
  version: string;
  version_date: string;
  goal: string;
  principles: string;
  steps: string;
  example: string | null;
  checklist: string;
  systems: SopSystem[];
  skill_id: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

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
