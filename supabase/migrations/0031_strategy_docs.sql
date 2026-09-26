-- Strategy docs: the Target Audience sheet and the Offer sheet, edited inside Personal OS.
-- One row per document (slug: target-audience, offer). Every save keeps the previous
-- text in strategy_doc_versions so a wrong edit can be undone. No hard delete of docs.
create table strategy_docs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'brendan',
  slug text not null,
  title text not null,
  content text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, slug)
);
alter table strategy_docs enable row level security;

create table strategy_doc_versions (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references strategy_docs(id) on delete cascade,
  content text not null,
  saved_at timestamptz default now()
);
alter table strategy_doc_versions enable row level security;
create index strategy_doc_versions_doc_idx on strategy_doc_versions (doc_id, saved_at desc);
