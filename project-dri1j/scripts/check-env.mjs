#!/usr/bin/env node
/**
 * Validates Supabase env before deploy / local run.
 * Loads `.env.local` when present (does not override existing process.env).
 *
 *   npm run check-env
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envLocal = path.join(root, ".env.local");

function loadDotEnvLocal() {
  if (!fs.existsSync(envLocal)) return;
  const raw = fs.readFileSync(envLocal, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const secret =
  process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

let exitCode = 0;
const problems = [];

if (!url) {
  problems.push("NEXT_PUBLIC_SUPABASE_URL is missing.");
  exitCode = 1;
} else {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") problems.push("NEXT_PUBLIC_SUPABASE_URL should use https:");
  } catch {
    problems.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
    exitCode = 1;
  }
}

if (!pub && !anon) {
  problems.push(
    "Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase → Settings → API).",
  );
  exitCode = 1;
}

if (!secret && process.env.VERCEL === "1") {
  problems.push(
    "WARN: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY not set on Vercel — add it so /api/health/supabase and server APIs work.",
  );
}

for (const p of problems) {
  console.error(`[check-env] ${p}`);
}

if (exitCode === 0) {
  console.log("[check-env] OK — browser Supabase env looks configured.");
  if (url) {
    try {
      console.log(`[check-env] Project host: ${new URL(url).host}`);
    } catch {
      /* noop */
    }
  }
  console.log(
    "[check-env] Run SQL in THIS Supabase project only: copy project-dri1j/supabase/magic_mobile_schema.sql then pg_notify reload.",
  );
}

process.exit(exitCode);
