import SkillDetail from '@/components/skills/SkillDetail';

export default async function SkillDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SkillDetail slug={slug} />;
}
