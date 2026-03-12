/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SCP_URL:     process.env.NEXT_PUBLIC_SCP_URL     || "http://localhost:9500",
    NEXT_PUBLIC_GRAFANA_URL: process.env.NEXT_PUBLIC_GRAFANA_URL || "http://localhost:3001",
    NEXT_PUBLIC_CHAIN_RPC:   process.env.NEXT_PUBLIC_CHAIN_RPC   || "http://localhost:8545",
  },
  async rewrites() {
    return [
      {
        source: "/api/scp/:path*",
        destination: `${process.env.NEXT_PUBLIC_SCP_URL || "http://localhost:9500"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
