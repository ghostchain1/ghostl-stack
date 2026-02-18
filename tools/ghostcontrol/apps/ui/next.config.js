const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  eslint: {
    // Keep production builds deterministic in this mixed npm/pnpm monorepo.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
