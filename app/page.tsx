import SessionCard from '@/components/dashboard/SessionCard';
import Panel from '@/components/ui/Panel';

export default function Home() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SessionCard />
      <Panel title="02 // Habits"><p style={{ color: 'var(--ink-3)' }}>Habit tracker lands in Phase 2.</p></Panel>
    </div>
  );
}
