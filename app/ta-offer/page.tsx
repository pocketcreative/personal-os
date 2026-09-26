import TaOffer from '@/components/strategy/TaOffer';

// ?doc=target-audience (default) or ?doc=offer picks which document opens.
export default async function TaOfferPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const { doc } = await searchParams;
  return <TaOffer initialDoc={doc === 'offer' ? 'offer' : 'target-audience'} />;
}
