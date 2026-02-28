/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use a user-owned build directory to avoid permission issues with root-owned .next artifacts.
  distDir: process.env.NEXT_DIST_DIR || '.next-ghost',
  output: 'standalone',
  reactStrictMode: true
};

module.exports = nextConfig;
