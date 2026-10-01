import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import SharedView from '@/components/shares/SharedView';
import { findActiveShare } from '@/lib/shareLookup';

// Never indexed, and the token in the URL is not sent on as a referrer. The
// title is generic on purpose: the page fetches the item client side.
export const metadata: Metadata = {
  title: 'Shared with you',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // A 'cms' share is the whole board, not one item -- same redirect-to-the-
  // first-tab pattern as /media/page.tsx sending '/media' to '/media/lf'.
  // Checking resource_type here needs no password (that gate still applies
  // once the real tab page loads); an inactive/unknown token just falls
  // through to SharedView's own "this link isn't available" state below.
  const share = await findActiveShare(token);
  if (share?.resource_type === 'cms') redirect(`/share/${token}/lf`);
  return <SharedView token={token} />;
}
