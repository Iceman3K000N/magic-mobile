import type { NextConfig } from "next";
import { buildConnectSrc } from "./lib/csp-connect-src";

const nextConfig: NextConfig = {
  /**
   * Monorepo: parent + app each have a lockfile; Next otherwise guesses the wrong
   * workspace root. Use the app directory (this folder), works on Vercel + local.
   */
  turbopack: {
    root: ".",
  },
  reactStrictMode: true,
  /** Avoid `redirect()` in `app/magichub/page.tsx` — on Next 16 + Turbopack it surfaces as a fake “render error” and breaks `/magichub`. */
  async redirects() {
    return [
      { source: "/magichub", destination: "/magichub/dashboard", permanent: false },
      { source: "/magichub/", destination: "/magichub/dashboard", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data: https://fonts.gstatic.com",
              `connect-src ${buildConnectSrc()}`,
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
