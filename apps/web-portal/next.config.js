/** @type {import("next").NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,
  output: "standalone",
  env: {
    NEXT_PUBLIC_SITE_NAME: "GhostStack Portal",
    NEXT_PUBLIC_DOMAIN:    "portal.ghostchain.cloud",
    NEXT_PUBLIC_API_URL:   "https://api.ghostchain.cloud",
    NEXT_PUBLIC_RPC_L1:    "https://ghostchain.cloud/rpc/l1",
    NEXT_PUBLIC_RPC_L2:    "https://ghostchain.cloud/rpc/l2",
  },
};
module.exports = nextConfig;
