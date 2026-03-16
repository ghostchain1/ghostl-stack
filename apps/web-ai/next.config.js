const { createPublicSiteNextConfig } = require("../../packages/config/index.js");

module.exports = createPublicSiteNextConfig("ai", {
  distDir: process.env.NEXT_DIST_DIR || ".next-ghost",
  output: process.env.NEXT_OUTPUT_MODE || "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
});
