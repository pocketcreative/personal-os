// Phase 3: link each agent role to its real Skills now that `skills` exists
// (migration 0020) and `agent_skills` has its FK to it. One-time real data
// population, not a schema change -- safe to re-run (upsert-style: only
// inserts pairs that don't already exist).
//
// Run:
//   node --env-file=.env.local scripts/link-agent-skills.mjs
//   node --env-file=.env.local scripts/link-agent-skills.mjs --dry-run

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');
const USER_ID = process.env.USER_ID ?? 'brendan';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Real mapping, confirmed against the live `skills` table's actual slugs
// (queried, not guessed) -- see the Phase 3 build plan / task brief.
const MAPPING = {
  'Copywriter Agent': [
    'ai-long-form-scriptwriting', 'ai-short-form-scriptwriting', 'ai-storytelling-scriptwriting',
    'ai-youtube-title-writing', 'email-sms-writing', 'humanizer',
  ],
  'Developer Agent': [
    // addyosmani dev-lifecycle pack + base Claude Code design/planning
    // skills actually relevant to building Personal OS -- excludes the
    // more generic ideation tools (grill-me, idea-refine, interview-me,
    // watch, media-use) that aren't specific to coding work.
    'api-and-interface-design', 'browser-testing-with-devtools', 'ci-cd-and-automation',
    'code-review-and-quality', 'code-simplification', 'context-engineering',
    'debugging-and-error-recovery', 'deprecation-and-migration', 'design-brief', 'design-flow',
    'design-review', 'design-tokens', 'documentation-and-adrs', 'doubt-driven-development',
    'frontend-design', 'frontend-ui-engineering', 'git-workflow-and-versioning',
    'incremental-implementation', 'information-architecture', 'observability-and-instrumentation',
    'performance-optimization', 'planning-and-task-breakdown', 'security-and-hardening',
    'shipping-and-launch', 'source-driven-development', 'spec-driven-development',
    'test-driven-development', 'using-agent-skills',
  ],
  'Long Form Editor Agent': ['long-form-editor', 'graphics-pipeline', 'visual-cues', 'background-music'],
  'Short Form/Reel Editor Agent': [
    'reel-pipeline', 'reel-extractor', 'reel-cutter', 'reel-transcript-auditor',
    'reel-editor', 'reel-auditor', 'reel-publisher', 'background-music',
  ],
  'Motion Graphics Agent': [
    'pocket-motion', 'pocket-motion-auditor', 'graphics-plan', 'graphics-pipeline',
    'motion-graphics', 'hyperframes',
  ],
  'Ops/Research Agent': [
    'crm-pipeline-review', 'ghl-workflow-architect', 'lead-followup-writer',
    'weekly-reactivation-outreach', 'lead-magnet-builder', 'ad-recreator',
  ],
  // Brendan: none.
};

async function main() {
  const { data: agents, error: agentsErr } = await db.from('agents').select('id, name').eq('user_id', USER_ID);
  if (agentsErr) throw new Error(agentsErr.message);
  const { data: skills, error: skillsErr } = await db.from('skills').select('id, slug').eq('user_id', USER_ID);
  if (skillsErr) throw new Error(skillsErr.message);
  const skillBySlug = new Map(skills.map((s) => [s.slug, s.id]));
  const agentByName = new Map(agents.map((a) => [a.name, a.id]));

  const rows = [];
  const missing = [];
  for (const [agentName, slugs] of Object.entries(MAPPING)) {
    const agentId = agentByName.get(agentName);
    if (!agentId) { missing.push(`agent not found: ${agentName}`); continue; }
    for (const slug of slugs) {
      const skillId = skillBySlug.get(slug);
      if (!skillId) { missing.push(`skill not found: ${slug} (for ${agentName})`); continue; }
      rows.push({ agent_id: agentId, skill_id: skillId, agent_name: agentName, slug });
    }
  }

  console.log(`Planned links: ${rows.length}`);
  for (const [agentName] of Object.entries(MAPPING)) {
    const count = rows.filter((r) => r.agent_name === agentName).length;
    console.log(`  ${agentName}: ${count}`);
  }
  if (missing.length) {
    console.log('\nNOT mapped (not found in live tables):');
    for (const m of missing) console.log(`  - ${m}`);
  }

  if (DRY_RUN) { console.log('\n--dry-run: nothing written.'); return; }

  const { data: existing, error: existErr } = await db.from('agent_skills').select('agent_id, skill_id');
  if (existErr) throw new Error(existErr.message);
  const existingSet = new Set(existing.map((r) => `${r.agent_id}:${r.skill_id}`));
  const toInsert = rows
    .filter((r) => !existingSet.has(`${r.agent_id}:${r.skill_id}`))
    .map((r) => ({ agent_id: r.agent_id, skill_id: r.skill_id }));

  if (toInsert.length === 0) { console.log('\nAll links already exist -- nothing to insert.'); return; }
  const { error: insErr } = await db.from('agent_skills').insert(toInsert);
  if (insErr) throw new Error(insErr.message);
  console.log(`\nInserted ${toInsert.length} agent_skills rows.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
