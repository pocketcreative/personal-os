import AgentDetail from '@/components/agents/AgentDetail';

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentDetail id={id} />;
}
