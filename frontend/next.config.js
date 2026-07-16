/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",  // Required for Docker multi-stage build

  // Enable React strict mode for better error detection
  reactStrictMode: true,

  // Environment variables available to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000',
  },

  // API route rewrites so frontend can call backend without CORS issues
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://aegis-fastapi:8000'}/api/:path*`,
      },
      {
        source: '/admin/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://aegis-fastapi:8000'}/admin/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
