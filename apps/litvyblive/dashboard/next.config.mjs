/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: `${process.env.BACKEND_URL ?? "http://localhost:7001"}/:path*`,
    },
    {
      source: "/ghostbrain/:path*",
      destination: `${process.env.GHOSTBRAIN_URL ?? "http://localhost:7002"}/:path*`,
    },
  ],
  env: {
    GHOST_L3_CHAIN_ID: "903",
    GHOST_L3_RPC: process.env.GHOST_L3_RPC ?? "http://localhost:39545",
  },
};

export default nextConfig;
