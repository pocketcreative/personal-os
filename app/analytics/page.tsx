import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';
import { parseFilters, parseTab } from '@/lib/outlierFilters';

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  return (
    <AnalyticsDashboard
      initialTab={parseTab(one(sp.tab))}
      initialFilters={parseFilters({ score: one(sp.score), window: one(sp.window), q: one(sp.q) })}
    />
  );
}
