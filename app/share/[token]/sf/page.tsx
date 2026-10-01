import SharedMediaPage from '@/components/shares/SharedMediaPage';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedMediaPage token={token} type="sf" />;
}
