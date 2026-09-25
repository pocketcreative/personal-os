import type { Metadata } from 'next';
import SharedView from '@/components/shares/SharedView';

// Never indexed, and the token in the URL is not sent on as a referrer. The
// title is generic on purpose: the page fetches the item client side.
export const metadata: Metadata = {
  title: 'Shared with you',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedView token={token} />;
}
