/** @type {import('next').NextConfig} */
const backendUrl = (process.env.BACKEND_URL || 'https://truck-route-finder.vercel.app')
  .trim()
  .replace(/\/+$/, '');

const nextConfig = {
  compress: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
