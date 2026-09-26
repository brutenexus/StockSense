import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // node:sqlite is a Node built-in and bcryptjs is loaded from node_modules at
  // runtime — keep both out of the bundler graph.
  serverExternalPackages: ['bcryptjs'],
  async redirects() {
    return [
      { source: '/operations', destination: '/operations/receipts', permanent: false },
      { source: '/settings', destination: '/settings/warehouses', permanent: false },
      { source: '/stock', destination: '/products', permanent: false },
    ];
  },
};

export default nextConfig;
