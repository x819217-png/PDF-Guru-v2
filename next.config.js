/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['next-auth'],
  },
};

module.exports = nextConfig;
