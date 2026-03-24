/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use a user-owned build directory to avoid permission issues with root-owned .next artifacts.
  distDir: process.env.NEXT_DIST_DIR || '.next-ghost',
  // NEXT_OUTPUT_MODE=export enables static export (used by GitHub Pages CI).
  output: process.env.NEXT_OUTPUT_MODE || 'standalone',
  reactStrictMode: true,
  typescript: {
    // Pre-existing module resolution errors (ghost SDK, three.js) are workspace-level issues.
    ignoreBuildErrors: true,
  },
  async headers() {
    // Security headers applied to all routes.
    // CSP keeps 'unsafe-inline' for scripts/styles because Next.js App Router
    // injects inline hydration scripts; 'unsafe-eval' is intentionally absent.
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY'
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin'
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
      },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' https: wss:",
          "font-src 'self' data: https:",
          "frame-src 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'"
        ].join('; ')
      }
    ];
    return [
      {
        source: '/(.*)',
        headers: securityHeaders
      }
    ];
  }
};

module.exports = nextConfig;
