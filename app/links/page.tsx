import LinksTable from '@/components/links/LinksTable';

// /links: Brendan's main links reference. Was a hardcoded array (see git
// history); now a real database table (migration 0032_links.sql) via
// /api/links, editable and deletable inline like Skills/SOPs. 2026-09-28.
export default function LinksPage() {
  return <LinksTable />;
}
