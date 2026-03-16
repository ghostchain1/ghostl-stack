/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next-ghost",
  output: process.env.NEXT_OUTPUT_MODE || "standalone",
  reactStrictMode: true,
};

module.exports = nextConfig;
