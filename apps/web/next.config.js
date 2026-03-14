/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SCP_URL:        process.env.NEXT_PUBLIC_SCP_URL        || "http://localhost:9500",
    NEXT_PUBLIC_GRAFANA_URL:    process.env.NEXT_PUBLIC_GRAFANA_URL    || "http://localhost:3001",
    NEXT_PUBLIC_CHAIN_RPC:      process.env.NEXT_PUBLIC_CHAIN_RPC      || "http://localhost:8545",
    NEXT_PUBLIC_UO_URL:         process.env.NEXT_PUBLIC_UO_URL         || "http://localhost:9990",
    NEXT_PUBLIC_KERNEL_URL:     process.env.NEXT_PUBLIC_KERNEL_URL     || "http://localhost:9300",
    NEXT_PUBLIC_GIN_URL:        process.env.NEXT_PUBLIC_GIN_URL        || "http://localhost:9600",
    NEXT_PUBLIC_AIM_URL:        process.env.NEXT_PUBLIC_AIM_URL        || "http://localhost:9400",
    NEXT_PUBLIC_KERNEL_WS_URL:  process.env.NEXT_PUBLIC_KERNEL_WS_URL  || "ws://localhost:9300",
  },
  async headers() {
    return [
      {
        // Prevent browsers from caching any HTML page — forces re-fetch on every navigation
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma",        value: "no-cache" },
          { key: "Expires",       value: "0" },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      {
        source:      "/api/scp/:path*",
        destination: `${process.env.NEXT_PUBLIC_SCP_URL || "http://localhost:9500"}/:path*`,
      },
      {
        source:      "/api/uo/:path*",
        destination: `${process.env.NEXT_PUBLIC_UO_URL || "http://localhost:9990"}/:path*`,
      },
      {
        source:      "/api/blockchain/:path*",
        destination: `${process.env.NEXT_PUBLIC_CHAIN_RPC || "http://localhost:8545"}/:path*`,
      },
      {
        source:      "/api/gin/:path*",
        destination: `${process.env.NEXT_PUBLIC_GIN_URL || "http://localhost:9600"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

