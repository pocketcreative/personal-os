-- Kanban board rebuild (spec finalized 2026-09-24 after two prior stopped
-- attempts): tasks need to carry which agent role(s) are working them
-- (separate from `owner`, which is a single free-text name/identity) and
-- whether they're a one-off or a recurring automation firing.
--
-- agent_tags is a free-text array on purpose (not a fixed enum), same
-- rationale as owner (migration 0010): the roster of agent roles can grow
-- without a migration each time a new one is added. The UI seeds a starter
-- list of 7 (Copywriter/Developer/Long Form Editor/Short Form-Reel Editor/
-- Motion Graphics/Ops-Research/Brendan) but allows free text too.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
alter table tasks
  add column agent_tags text[] not null default '{}',
  add column task_type text not null default 'single'
    check (task_type in ('single', 'scheduled'));

create index tasks_agent_tags_idx on tasks using gin (agent_tags);

-- Backfill agent_tags for real existing tasks based on their current `owner`
-- field and title (owner is a strong real signal already on each row; a
-- handful of ambiguous/blank-owner rows are left with agent_tags = '{}'
-- rather than guessed). task_type is left at its default 'single' for every
-- existing row -- none of the current real tasks are actual recurring-
-- automation firings, they're one-off build/edit/write tasks.
update tasks set agent_tags = array['Developer Agent'] where id = 'a65a95a7-4775-4eec-b05c-eb820687c7cf';
update tasks set agent_tags = array['Developer Agent'] where id = '1c2fdfd8-44b3-4504-a25a-910c5357c43d';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = 'ed3eea49-c7c8-492e-b78f-2cbecf057201';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = 'f79e0fdc-d8cd-431d-933e-56d8b23c5307';
update tasks set agent_tags = array['Developer Agent'] where id = '82048392-5761-45a5-86b3-fe3657da557e';
update tasks set agent_tags = array['Long Form Editor Agent'] where id = 'cb755614-4cf2-463e-b30c-dbfa3c708bda';
update tasks set agent_tags = array['Developer Agent'] where id = '1161a52e-315a-4520-b415-cc3b51a0e6ac';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '791252ff-e06f-4d6b-93d5-e4da10c44920';
update tasks set agent_tags = array['Copywriter Agent'] where id = '8377545d-98b0-4d46-bb73-ea25717cabb6';
update tasks set agent_tags = array['Copywriter Agent'] where id = 'd5e494d4-d435-407a-8235-204118efaf23';
update tasks set agent_tags = array['Copywriter Agent'] where id = '92e7eff4-f0c1-4402-ac27-f0410b6f1d34';
update tasks set agent_tags = array['Developer Agent'] where id = 'b2ff1194-0eb8-463b-9626-6ece82185884';
update tasks set agent_tags = array['Developer Agent'] where id = 'c7fc6d68-0ee2-4ae9-b833-5fa86da46085';
update tasks set agent_tags = array['Developer Agent'] where id = 'd81d7f75-fae4-46ee-af32-ca9ad9c3ee7e';
update tasks set agent_tags = array['Developer Agent'] where id = 'd175d30e-46e8-486d-9cb7-25e3ec0b2a49';
update tasks set agent_tags = array['Developer Agent'] where id = 'a277d926-60df-4851-a02b-cc90b762cdbe';
update tasks set agent_tags = array['Long Form Editor Agent'] where id = '0c1fc459-32be-46fd-bd2e-f7bc55b1e95f';
update tasks set agent_tags = array['Long Form Editor Agent'] where id = 'cce7f964-298b-40e8-9322-de30131b30f1';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'bf9ce0f4-301e-4511-b355-9fd015f9a334';
update tasks set agent_tags = array['Copywriter Agent'] where id = '1eedba80-c08a-4944-a7a0-31ab0cae76cc';
update tasks set agent_tags = array['Copywriter Agent'] where id = '8db1d7d6-fc11-4c29-a955-d2b07848ee1d';
update tasks set agent_tags = array['Developer Agent'] where id = '24d033c9-9a9d-4c8d-b04c-c8ac9b1eefd7';
update tasks set agent_tags = array['Developer Agent'] where id = 'bcd176b9-c6b4-4b91-a23d-e01202155cdd';
update tasks set agent_tags = array['Developer Agent'] where id = 'ad62253d-3a06-4523-82ee-40c1f70df653';
update tasks set agent_tags = array['Developer Agent'] where id = 'b39a9e84-2f94-471b-b183-0a32934c8c8c';
update tasks set agent_tags = array['Long Form Editor Agent'] where id = 'ab523120-c18b-499f-a6ad-f67ecba6f6b4';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = 'e8ff4cc5-2676-45dc-838d-c981909186a7';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = 'ff6b5f8e-7d13-43ce-9f83-ba8c3617db25';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = 'fd6330d8-c85f-4e07-87ae-67e87f398087';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = '71bbec3a-2c79-4099-87fc-04dcf9201f9e';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = 'd1ad6097-3a67-4aac-ae2c-3592a009818d';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = '2138dffb-fbde-4e4e-a82f-87aa52cb1895';
update tasks set agent_tags = array['Developer Agent'] where id = 'f689e476-f9fa-403c-8678-a9cbe7a71efa';
update tasks set agent_tags = array['Copywriter Agent'] where id = '41126eb8-805c-4315-97c4-56cf2555421f';
update tasks set agent_tags = array['Developer Agent'] where id = '87adddfe-d768-4513-b409-0db9e27d5975';
update tasks set agent_tags = array['Developer Agent'] where id = 'ea6e3de0-744f-4e1c-af76-ebadfaa56905';
update tasks set agent_tags = array['Developer Agent'] where id = 'efaa0bb9-6b85-4063-905b-58a40310f434';
update tasks set agent_tags = array['Developer Agent'] where id = 'd248e6b4-40bb-43bb-bc35-47a01f1da717';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'c354395b-7364-4db6-af96-244bc708f92e';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '98f5a3fb-ab15-44f1-ba99-766549e337f0';
update tasks set agent_tags = array['Short Form/Reel Editor Agent'] where id = 'e9040b1b-816d-4f9f-8180-ad84d2635c3d';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '839f8cd5-9cea-4147-89a2-364e0b3df922';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'a62ba6c0-fdeb-4bbd-81e7-c6ac50bad3d6';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'c444b47c-95c9-486c-8b7e-a9379a7ba7d1';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'a77b5e1e-49aa-476e-9d20-80e78b383738';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'dd78e1d5-788a-499d-8156-f392b23b0d52';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'dce28477-d946-4bca-8b29-34073ef6249d';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'fb36b324-08df-4600-bb7a-fc003cc4a391';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '9fd76482-a9a7-4bdf-8fdf-7f8d8030ecb8';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '06dc5ef4-cd62-49df-9a2c-dbb7e67bfa9c';
update tasks set agent_tags = array['Brendan'] where id = '9be4a9dd-836c-4b99-9c39-18f75b6827fd';
update tasks set agent_tags = array['Long Form Editor Agent'] where id = '9da319e1-c34b-4672-8f25-cb53579ec98d';
update tasks set agent_tags = array['Developer Agent'] where id = 'e639133e-3c6c-4437-af69-0d53a9969412';
update tasks set agent_tags = array['Developer Agent'] where id = '3f8ea0ec-ef10-4d80-a587-87b074795410';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '947e9a01-e753-4841-ba8b-21a570798586';
update tasks set agent_tags = array['Developer Agent'] where id = '34461599-f8f1-4a6d-bf32-c0eec3444ae7';
update tasks set agent_tags = array['Copywriter Agent'] where id = '5c726df6-478f-4d50-813e-f8c569e21272';
update tasks set agent_tags = array['Copywriter Agent'] where id = '6fc5bf7a-d13c-48da-b3aa-3d598c61e0ad';
update tasks set agent_tags = array['Copywriter Agent'] where id = '76ebb4a7-a893-4926-8773-c1903fdb3a52';
update tasks set agent_tags = array['Developer Agent'] where id = 'd8dff5b2-57df-47fe-96b9-654e4670164a';
update tasks set agent_tags = array['Developer Agent'] where id = '71766283-1d53-4d8c-805f-a69e71369758';
update tasks set agent_tags = array['Brendan'] where id = '9865ad43-0631-47e0-9920-c8e36ea38377';
update tasks set agent_tags = array['Copywriter Agent'] where id = '98c11d54-6b16-4b29-b50c-001983da73d0';
update tasks set agent_tags = array['Developer Agent'] where id = 'e09ce558-9857-48b5-85b8-62386c1dd203';
update tasks set agent_tags = array['Developer Agent'] where id = '5ed6e484-037e-4a69-b89b-51b9f5133cba';
update tasks set agent_tags = array['Brendan'] where id = '8052e9f2-c399-49be-a646-8a1a4685f415';
update tasks set agent_tags = array['Copywriter Agent'] where id = '4189d3f5-74cc-4942-b619-95246fb2b9d4';
update tasks set agent_tags = array['Copywriter Agent'] where id = 'd2c2bfcb-a4ac-46c6-a5bd-bdd64e87ab76';
update tasks set agent_tags = array['Copywriter Agent'] where id = 'ebaf385f-3ce7-4984-8049-609cf43ccce7';
update tasks set agent_tags = array['Copywriter Agent'] where id = '9c8d03cb-b100-4b47-9e6a-87ca2a0a8ac2';
update tasks set agent_tags = array['Copywriter Agent'] where id = '476ddc4f-30f4-44f3-981d-eed57ea89e10';
update tasks set agent_tags = array['Copywriter Agent'] where id = '277f216b-b645-4935-95f9-915074162397';
update tasks set agent_tags = array['Copywriter Agent'] where id = '47ad45f4-bc30-45a1-bf36-174336b16539';
update tasks set agent_tags = array['Copywriter Agent'] where id = '21236e0b-c90b-471b-8277-d88b7ff9d76a';
update tasks set agent_tags = array['Developer Agent'] where id = 'acac689f-aa24-4832-91c1-f28515bf19ca';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '7d8eda52-5ec5-4d19-a8d9-393d0ffda273';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'e0c9b64e-8020-4c46-b060-d7b8b9103645';
update tasks set agent_tags = array['Developer Agent'] where id = '527057ef-6a08-422a-8c23-01646f6222bf';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '70512dc6-eabc-440b-97a0-4204b612bd24';
update tasks set agent_tags = array['Copywriter Agent'] where id = 'c9712fe8-7caa-472c-9084-1faacef09d5d';
update tasks set agent_tags = array['Ops/Research Agent'] where id = 'ce205a24-dfb8-4f32-ac85-68cfeb8a2b93';
update tasks set agent_tags = array['Developer Agent'] where id = '29923056-b2a8-4887-8ad5-91efda47c778';
update tasks set agent_tags = array['Developer Agent'] where id = '16cb5ffe-37df-48c6-895d-b9b4e56e93e2';
update tasks set agent_tags = array['Copywriter Agent'] where id = '36732360-6d70-4af3-bd16-3903394b9696';
update tasks set agent_tags = array['Copywriter Agent'] where id = '82179ed4-fe06-46e8-bb7e-b408decac2ca';
update tasks set agent_tags = array['Ops/Research Agent'] where id = '8d21dc6a-f7fd-433c-b13c-9386756d431e';
update tasks set agent_tags = array['Developer Agent'] where id = '4f610739-c8b8-441a-9448-e3ea182e7114';
