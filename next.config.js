/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ["vina-ai.com", "*.vercel.app"] } },
};
module.exports = nextConfig;
