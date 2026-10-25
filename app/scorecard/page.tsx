import ScorecardBoard from '@/components/scorecard/ScorecardBoard';
import { localDateKey } from '@/lib/dates';

// "Today" must be resolved per request in SGT, never baked in at build time.
export const dynamic = 'force-dynamic';

export default function ScorecardPage() {
  return <ScorecardBoard today={localDateKey()} />;
}
