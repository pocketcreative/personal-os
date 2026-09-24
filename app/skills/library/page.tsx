import { redirect } from 'next/navigation';

// Fix 1: Skills and the old Skills Library are one page now (/skills,
// filterable by source). This route stays only as a redirect so anything
// bookmarked/linked to it doesn't dead-end.
export default function SkillsLibraryPage() {
  redirect('/skills');
}
