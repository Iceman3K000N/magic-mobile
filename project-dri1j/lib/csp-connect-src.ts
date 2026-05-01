/**
 * Build Content-Security-Policy `connect-src` so Supabase works for hosted, local, and custom URLs.
 * Used by `next.config.ts` at build time (`NEXT_PUBLIC_SUPABASE_URL` must be set in env when building).
 */
export function buildConnectSrc(): string {
  const parts = new Set<string>([
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://*.supabase.in",
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "ws://127.0.0.1:54321",
    "ws://localhost:54321",
  ]);

  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      parts.add(u.origin);
      if (u.protocol === "https:") parts.add(`wss://${u.host}`);
      if (u.protocol === "http:") parts.add(`ws://${u.host}`);
    } catch {
      /* ignore invalid URL */
    }
  }

  return Array.from(parts).join(" ");
}
