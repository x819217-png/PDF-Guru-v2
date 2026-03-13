// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 支持 Cloudflare Pages
  experimental: {
    runtime: 'edge',
  },
};

module.exports = nextConfig;
