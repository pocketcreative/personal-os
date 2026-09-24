import SopDetail from '@/components/skills/SopDetail';

export default async function SopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SopDetail id={id} />;
}
