/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@eqr/config', '@eqr/domain', '@eqr/database', '@eqr/services'],
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;
