import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kept Word',
  icons: { apple: '/scorecard-icon-180.png' },
  appleWebApp: { capable: true, title: 'Kept Word', statusBarStyle: 'default' },
};

export default function ScorecardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
