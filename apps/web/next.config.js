/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use a user-owned build directory to avoid permission issues with root-owned .next artifacts.
  distDir: process.env.NEXT_DIST_DIR || '.next-ghost',
  // NEXT_OUTPUT_MODE=export enables static export (used by GitHub Pages CI).
  output: process.env.NEXT_OUTPUT_MODE || 'standalone',
  reactStrictMode: true
};

module.exports = nextConfig;
