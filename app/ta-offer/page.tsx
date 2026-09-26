import TaOffer from '@/components/strategy/TaOffer';
import { parseDocParam } from '@/lib/strategyDocs';

// ?doc=target-audience (default), workshop-offer or partnership-offer picks which document opens.
// The old ?doc=offer still works and opens the Partnership Offer.
export default async function TaOfferPage({ searchParams }: { searchParams: Promise<{ doc?: string | string[] }> }) {
  const { doc } = await searchParams;
  return <TaOffer initialDoc={parseDocParam(doc)} />;
}
