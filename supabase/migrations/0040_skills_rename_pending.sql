-- Set when the OS renames a synced skill. sync-skills.mjs moves the local
-- folder from renamed_from to slug, then sets it back to null.
alter table skills add column renamed_from text;
