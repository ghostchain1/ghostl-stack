/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  // Use a user-owned build directory to avoid permission issues with root-owned .next artifacts.
  distDir: process.env.NEXT_DIST_DIR || '.next-ghost'
};

module.exports = nextConfig;
