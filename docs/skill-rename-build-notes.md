# Skill rename: build notes

True rename of a skill from the OS. Only source='brendan', status='active', sync_to_local=true skills.

## What changed

- `supabase/migrations/0040_skills_rename_pending.sql`: adds `skills.renamed_from text`. NOT applied.
- `lib/types.ts`: `renamed_from: string | null` on Skill.
- `lib/skillFile.ts`: new `validateSlug`, `renameFrontmatterName`; `bumpVersion` moved here (was private in the skills PATCH route) so the rename route shares it.
- `app/api/skills/[slug]/rename/route.ts`: new POST { new_slug, updated_at }. Checks in order: 404, 403 (not brendan), 400 (archived or not synced), 409 (stale updated_at), 400 (bad name or same name), 409 (name used, pre-check and Postgres 23505). Audit row `skill_renamed` first, then one conditional update (id + updated_at). Sets slug, content `name:` line, version, version_date, updated_at, `renamed_from = renamed_from ?? old slug`.
- `app/api/skills/route.ts`, `app/api/skills/[slug]/route.ts`: responses default `renamed_from` to null (works before the migration). PATCH comment points to the rename route. DELETE (archive) returns 400 while `renamed_from` is set.
- `lib/useSkills.ts`: `renameSkill(slug, newSlug, updatedAt)`.
- `components/skills/SkillDetail.tsx`: Rename button (editable + sync_to_local), inline input with Save and Cancel, disabled while dirty or saving, confirm text as specified, `router.replace` to the new slug plus `skills:refresh`. Badge shown while `renamed_from` is set.
- `scripts/sync-skills.mjs`: rename branch at the top of the per-skill loop (see below), plus `findMentions` helper.
- `scripts/import-skills.mjs`: refuses with `--apply` path (any non dry-run) if any row has `renamed_from`; dry run only warns. TIER_A list untouched.
- `tests/skillRename.test.ts`: validateSlug and renameFrontmatterName tests.

## Sync branch order

1. `--force` or `--adopt-local`: prints "rename pending for <slug>, run without flags", skips.
2. Busy check (unless `--ignore-busy`).
3. Old gone + new exists: SKILL.md sha256 equals record content sha256 then (apply) set synced_hash, clear flag; else CONFLICT.
4. Old gone + new gone: CONFLICT nothing on disk.
5. Both exist: CONFLICT target folder exists.
6. Old is a symlink: refuse.
7. Old SKILL.md hash != synced_hash: CONFLICT edited on the Mac.
8. Dry run: prints `would move`, plus mentions report. Apply: copy whole old folder to `~/.claude/skill-backups/<stamp>/<old>/`, rename folder, atomic write of record content, then DB update (synced_hash, last_synced_at, renamed_from null), mentions report, audit row `skill_rename_synced`.

## Run it

Apply the migration first (not done yet).

```
cd ~/Projects/personal-os && node --env-file=.env.local scripts/sync-skills.mjs --only <new-slug>
cd ~/Projects/personal-os && node --env-file=.env.local scripts/sync-skills.mjs --only <new-slug> --apply
```

## Live test checklist (scratch skill)

1. Apply migration 0040.
2. Create a scratch synced skill (for example `zz-rename-test`), run a normal sync so the Mac folder exists.
3. In the OS, rename it to `zz-rename-test-2`. Check the badge shows and the URL moved.
4. Check Delete (archive) is refused while the badge shows.
5. Dry run the sync: expect `would move zz-rename-test/ -> zz-rename-test-2/`.
6. Run with `--apply`: folder moved, SKILL.md `name:` updated, backup exists, badge gone after refresh.
7. Run the sync again: expect "already in sync".
8. Also try: rename to an existing name (409 message), edit the Mac file before sync (CONFLICT).
9. Archive the scratch skill afterwards.

## Known limits

- `TIER_A` in import-skills.mjs and the `link-agent-skills` MAPPING are keyed by slug. A renamed Tier A skill needs both updated by hand.
- Mentions of the old name in other skills are reported (file names and count), not rewritten.
- Claude Code caches the skill list per session; new sessions see the new name.
- PATCH with `status: 'archived'` is not blocked while a rename is pending (only the DELETE route is, as specified).
- Old URLs do not redirect.
