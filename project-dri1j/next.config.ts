import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { buildConnectSrc } from "./lib/csp-connect-src";

/** Absolute app root — must match `turbopack.root` and `outputFileTracingRoot` or Next warns on Vercel. */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /**
   * Monorepo: parent may have a lockfile; Next/Vercel otherwise infer different roots for
   * tracing vs Turbopack. Pin both to this app directory.
   */
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
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
