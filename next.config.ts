import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public share pages: never indexed, never cached, and the token in the URL
  // is not sent to other sites as a referrer.
  async headers() {
    return [
      {
        source: '/share/:path*',
        headers: [
          { key: 'x-robots-tag', value: 'noindex, nofollow' },
          { key: 'cache-control', value: 'no-store' },
          { key: 'referrer-policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
