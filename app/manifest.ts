import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kept Word',
    short_name: 'Kept Word',
    description: 'Daily habit scorecard',
    start_url: '/scorecard',
    scope: '/',
    display: 'standalone',
    background_color: '#f3f1ec',
    theme_color: '#024ADD',
    icons: [
      { src: '/scorecard-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/scorecard-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
