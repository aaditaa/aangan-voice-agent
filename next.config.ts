import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Knowledge files are read from disk at runtime; keep them in the lambda bundle.
  outputFileTracingIncludes: {
    '/api/**': ['./knowledge/**'],
  },
};

export default nextConfig;
