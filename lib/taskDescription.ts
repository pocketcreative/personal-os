// Task descriptions stay plain free-text/markdown (no rigid schema split —
// see CLAUDE.md's "structured Goal + Steps" spec). This just detects when a
// description already follows a `## Goal` / `## Steps` markdown shape so the
// detail view can render those as clear visual sections instead of one
// undifferentiated blob. Anything that doesn't match falls back to plain
// rendering unchanged — most existing tasks predate this structure.
export interface ParsedGoalSteps {
  goal: string;
  steps: string;
}

const GOAL_STEPS_RE = /^##\s*Goal\s*\n([\s\S]*?)\n##\s*Steps\s*\n([\s\S]*)$/i;

export function parseGoalSteps(description: string): ParsedGoalSteps | null {
  const match = description.match(GOAL_STEPS_RE);
  if (!match) return null;
  return { goal: match[1].trim(), steps: match[2].trim() };
}

export function formatGoalSteps(goal: string, steps: string): string {
  return `## Goal\n${goal.trim()}\n\n## Steps\n${steps.trim()}`;
}
