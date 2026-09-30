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
// Archived is not a board column any more: old and archived tasks live in the
// "Older and archived" list instead (see OlderTasksPanel).
export const KANBAN_COLUMNS: KanbanColumn[] = ['not_started', 'in_progress', 'needs_review', 'completed'];
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

// When a task was finished. completed_at is the real stamp, but many older
// completed rows never got one (they were closed by direct database writes),
// so updated_at stands in. Archiving clears completed_at, so an archived
// task's date is always updated_at (the day it was archived).
export function doneAt(t: Pick<Task, 'completed_at' | 'updated_at'>): string {
  return t.completed_at ?? t.updated_at;
}

export const RECENT_DONE_DAYS = 7;

// True when the task was finished in the last 7 days. Compares real moments
// in time (ms since epoch), not calendar days, so the local timezone can't
// shift the result.
export function isDoneRecently(t: Pick<Task, 'completed_at' | 'updated_at'>, now: Date = new Date()): boolean {
  return Date.parse(doneAt(t)) >= now.getTime() - RECENT_DONE_DAYS * 24 * 60 * 60 * 1000;
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
// the legacy `agent_runs` log (individual sub-agent invocations, no longer
// typed here) and from Task.agent_tags (which roles a given task is assigned to).
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

// Skills library (`/skills`, filterable by source -- the old `/skills/library`
// route redirects here rather than staying a separate page). Stored
// VERBATIM -- `content` is the exact bytes of the local SKILL.md
// (frontmatter included). No template, no extracted fields; the trigger
// text is read out of the frontmatter at display time (lib/skillFile.ts
// readTrigger), not duplicated into its own column.
export type SkillSource = 'brendan' | 'vendor';

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
  // 'vendor' (every other installed skill --
  // addyosmani pack, hyperframes, remotion, humanizer, etc. -- read-only).
  source: SkillSource;
  synced_hash: string | null;
  last_synced_at: string | null;
  status: 'active' | 'archived';
  // Migration 0026. Same 8-section tag as Sop.systems. The API always returns
  // an array (defaults to [] if the migration isn't applied yet).
  systems: SopSystem[];
  // Migration 0033. Who the skill is FOR: Brendan's own tools ('internal')
  // or built for a client/agent to run ('client'). Different axis from source.
  audience: SkillAudience;
  created_at: string;
  updated_at: string;
}

export type SkillAudience = 'internal' | 'client';

export const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  brendan: 'Your skill', vendor: 'Library',
};

// Lightweight row for the list view (GET /api/skills): everything a card
// needs except `content`, which used to be shipped for all ~86 skills just
// to extract a trigger blurb and support client-side search -- a 1.26MB
// payload for a list. `trigger_description` is computed server-side from
// content at query time (not a stored column -- see the Skill comment
// above on why the trigger text isn't duplicated into the schema).
export type SkillListItem = Omit<Skill, 'content'> & { trigger_description: string | null };

// SOPs (`/skills/sops`), Phase 2 Part B. Human-facing process documents --
// distinct from Skills (agent files, stored verbatim). `content` holds the
// whole body (Goal / Principles / Steps / Example / Checklist) as one raw
// markdown blob, same as skills.content (migration 0025 -- was originally 5
// separate structured fields, collapsed into one box to match the Skill
// editor, per Brendan's own instruction). title/systems/skill_id/progress
// stay their own columns.
export const SOP_SYSTEMS = [
  'Strategy', 'Differentiation', 'Trust', 'Interest', 'Pre Frame', 'Sales', 'Revival', 'Tracking',
] as const;
export type SopSystem = (typeof SOP_SYSTEMS)[number];

// Migration 0024. Distinct from `status` (active/archived, the record's own
// archival state) -- `progress` is Brendan's real-world read of the process
// itself: is he actually running this day to day (active), does the content
// exist but isn't yet something he's running (in_progress), or is there
// nothing there yet (not_started). Green / yellow / neutral badge.
export const SOP_PROGRESS = ['active', 'in_progress', 'not_started'] as const;
export type SopProgress = (typeof SOP_PROGRESS)[number];
export const SOP_PROGRESS_LABELS: Record<SopProgress, string> = {
  active: 'Active', in_progress: 'In Progress', not_started: 'Not Started',
};
export const SOP_PROGRESS_COLORS: Record<SopProgress, string> = {
  active: '#3a9d5d', in_progress: '#c9a227', not_started: '#9aa0a6',
};

export interface Sop {
  id: string;
  user_id: string;
  title: string;
  version: string;
  version_date: string;
  content: string;
  systems: SopSystem[];
  skill_id: string | null;
  status: 'active' | 'archived';
  progress: SopProgress;
  created_at: string;
  updated_at: string;
}

// `scene` is only present on the single-board fetch (the list omits it);
// its shape is BoardScene in lib/boardScene.ts.
export interface Board {
  id: string;
  user_id: string;
  title: string;
  scene?: unknown;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

// /links: Brendan's main links reference table.
export interface LinkItem {
  id: string;
  user_id: string;
  name: string;
  url: string | null;
  trigger_link: string | null;
  live_tested: boolean;
  sort_order: number;
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

// Native Content Management System (Phase 1, migration 0034), replacing the
// Notion "Content Management System (Sept 2026)" page. Distinct from the
// older ContentPiece/content_pieces above (still live at /media/old).
export type ContentItemType = 'lf' | 'lts' | 'sf' | 'ad' | 'vsl';

export const CONTENT_ITEM_TYPES: ContentItemType[] = ['lf', 'lts', 'sf', 'ad', 'vsl'];
export const CONTENT_ITEM_TYPE_LABELS: Record<ContentItemType, string> = {
  lf: 'Long Form', lts: 'Long to Short', sf: 'Short Form', ad: 'Ads', vsl: 'VSLs',
};

// Exact strings read off each live Notion data source's schema (fetched
// 2026-09-30) -- not invented. Stage options differ per type; Status
// ("not started") is LF-only per decision 8.
export const STAGE_OPTIONS: Record<ContentItemType, string[]> = {
  lf: ['Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled', 'Broadcast', 'LTS', 'Completed'],
  lts: ['Draft Clips', 'Selected Clips', 'Post Production', 'Scheduled'],
  sf: ['Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled'],
  ad: ['Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled'],
  vsl: ['Draft', 'Pre-Production', 'Production', 'Post Production', 'Scheduled'],
};
export const STATUS_OPTIONS: Record<ContentItemType, string[]> = {
  lf: ['not started', 'In Progress', 'To Review', 'Complete', 'Archive'],
  lts: ['In Progress', 'To Review', 'Complete', 'Archive'],
  sf: ['In Progress', 'To Review', 'Complete', 'Archive'],
  ad: ['In Progress', 'To Review', 'Complete', 'Archive'],
  vsl: ['In Progress', 'To Review', 'Complete', 'Archive'],
};
// Default Stage/Status for a freshly created item of each type.
export const DEFAULT_STAGE: Record<ContentItemType, string> = {
  lf: 'Draft', lts: 'Draft Clips', sf: 'Draft', ad: 'Draft', vsl: 'Draft',
};
export const DEFAULT_STATUS: Record<ContentItemType, string> = {
  lf: 'not started', lts: 'In Progress', sf: 'In Progress', ad: 'In Progress', vsl: 'In Progress',
};

// One entry per platform this item is actually scheduled on through the real
// Zernio API (POST /v1/posts to create, PUT /v1/posts/{id} to reschedule).
// Written by the server when a Post Date + platforms combination is saved;
// see lib/zernio.ts. Empty = not scheduled through Zernio.
export interface ZernioPostRef {
  platform: string;
  account_id: string;
  post_id: string;
  status: 'scheduled' | 'failed' | 'not_configured';
  scheduled_for: string | null;
  error?: string;
}

// scheduled_for is a naive "YYYY-MM-DDTHH:MM:SS" wall-clock string already in
// Asia/Singapore time (see lib/zernio.ts -- Zernio is given `timezone:
// "Asia/Singapore"` alongside it, no Z/offset suffix). Reading the HH:MM
// straight out of the string (rather than `new Date(iso)` + a timeZone
// conversion) is deliberate: a naive string with no offset gets parsed in
// the *viewer's own local timezone* by Date, which would silently show the
// wrong clock time to anyone not in Singapore. This always shows the real
// Singapore time it was actually scheduled for.
export function formatScheduledTime(scheduledFor: string): string | null {
  const m = /T(\d{2}):(\d{2})/.exec(scheduledFor);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

// The real post time for a calendar/item card. Prefers the time Brendan
// actually picked (post_time -- editable in the UI regardless of Zernio
// state, see ItemDetail.tsx), falling back to a live Zernio scheduled_for
// only for older items scheduled before post_time existed. Null when neither
// is set (never a guessed/default time shown to Brendan).
export function itemScheduledTime(item: Pick<ContentItem, 'zernio_post_ids' | 'post_time'>): string | null {
  if (item.post_time) return formatTimeOfDay(item.post_time);
  const live = item.zernio_post_ids.find((r) => r.status === 'scheduled' && r.scheduled_for);
  return live ? formatScheduledTime(live.scheduled_for!) : null;
}

// Formats a naive "HH:MM" or "HH:MM:SS" time-of-day string (as stored in
// content_items.post_time, always Singapore wall-clock) into "9:00 AM".
export function formatTimeOfDay(time: string): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(time);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${min} ${ampm}`;
}

// Minutes-since-midnight for conflict comparison, or null if unset/unparsable.
export function timeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{2}):(\d{2})/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Default time Zernio schedules a post for when Brendan hasn't picked one --
// matches the old hardcoded 09:00 default in lib/contentItemsServer.ts, now
// named so it isn't a silent magic string in two places.
export const DEFAULT_POST_TIME = '09:00';

// Two items on the same day are a real scheduling conflict (per Brendan's own
// ask) when their times are identical or within this many minutes -- close
// enough that they'd effectively compete for the same slot in a feed.
export const CONFLICT_WINDOW_MINUTES = 5;

export interface ContentItem {
  id: string;
  user_id: string;
  type: ContentItemType;
  name: string;
  stage: string;
  status: string | null;
  post_date: string | null;
  post_time: string | null; // "HH:MM:SS" wall-clock, Asia/Singapore -- see migration 0038
  raw_footage: string | null; // LF = Drive project-folder link, LTS = the actual footage file link (per-type convention)
  posted_footage: string | null;
  reference_video: string | null;
  asset_link: string | null; // LF-specific, always null on the other 4 types
  platforms: string[];
  caption: string | null;
  zernio_post_ids: ZernioPostRef[];
  // One continuous markdown document for the whole item, section structure
  // expressed as `## Heading` lines WITHIN this string, not as separate
  // stored fields (migration 0035 -- was a per-section jsonb map, collapsed
  // into one field per Brendan's own instruction: template content is one
  // textbox, not fragmented boxes).
  body_md: string;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  comment_count: number; // derived server-side on GET, same pattern as ContentPiece
  unresolved_comment_count: number;
}

export interface ContentTemplate {
  id: string;
  type: ContentItemType;
  // One continuous markdown document (migration 0035 -- was an array of
  // separate sections, one textarea each). A new item of this type starts
  // as a copy of this string; Brendan edits structure by editing the
  // `## Heading` lines directly, no separate add/reorder/remove UI.
  template_md: string;
  version: number;
  updated_at: string;
}

export interface ContentItemComment {
  id: string;
  item_id: string;
  author: string;
  body: string;
  video_timestamp_seconds: number | null;
  resolved: boolean;
  created_at: string;
}

export interface ContentIdea {
  id: string;
  user_id: string;
  idea: string;
  notes: string | null;
  used: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}
