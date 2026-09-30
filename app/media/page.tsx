import { redirect } from 'next/navigation';

// /media itself has no content of its own any more -- Calendar was the only
// thing rendered here and it's no longer a standalone tab (corrected
// 2026-09-30: it's a persistent section below whichever board tab is active,
// see ContentBoard.tsx). Send anyone landing on the bare /media URL (e.g.
// TopRail's nav link) to the first real board tab.
export default function MediaPage() {
  redirect('/media/lf');
}
