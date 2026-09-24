import { Suspense } from 'react';
import SkillsBoard from '@/components/skills/SkillsBoard';

// SkillsBoard reads the ?filter= param via useSearchParams, which requires
// a Suspense boundary in the App Router.
export default function SkillsPage() {
  return (
    <Suspense fallback={null}>
      <SkillsBoard />
    </Suspense>
  );
}
