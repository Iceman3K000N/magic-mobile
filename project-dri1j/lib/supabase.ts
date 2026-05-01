import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Legacy anon JWT (HS256) or new publishable key — see https://supabase.com/docs/guides/api */
function isValidBrowserSupabaseKey(key: string): boolean {
  const k = key.trim();
  if (/YOUR_ANON_KEY|your_anon_key|placeholder|changeme/i.test(k)) return false;
  if (k.startsWith('sb_publishable_')) return true;
  if (k.startsWith('eyJ') && k.split('.').length === 3) return true;
  return false;
}

/** Legacy service_role JWT or new secret API key (server-only). */
function isValidServiceSupabaseKey(key: string): boolean {
  const k = key.trim();
  if (k.startsWith('sb_secret_')) return true;
  if (k.startsWith('eyJ') && k.split('.').length === 3) return true;
  return false;
}

function resolveBrowserApiKey(): string | undefined {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = publishable || anon;
  if (!key || !isValidBrowserSupabaseKey(key)) return undefined;
  return key;
}

// Server-side Supabase client (uses service role key for admin operations)
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !serviceKey || !isValidServiceSupabaseKey(serviceKey)) {
    throw new Error(
      'Missing or invalid Supabase admin key. Set SUPABASE_SERVICE_ROLE_KEY (legacy JWT) or SUPABASE_SECRET_KEY (sb_secret_…) from Project Settings → API.',
    );
  }

  return createClient(supabaseUrl, serviceKey);
}

// Client-side Supabase client (publishable or anon JWT)
export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const apiKey = resolveBrowserApiKey();

  if (!supabaseUrl || !apiKey) {
    throw new Error(
      'Missing or invalid Supabase client keys. Set NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) or NEXT_PUBLIC_SUPABASE_ANON_KEY (eyJ…) in .env.local.',
    );
  }

  return createClient(supabaseUrl, apiKey);
}

let supabaseBrowserSingleton: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (supabaseBrowserSingleton) return supabaseBrowserSingleton;
  supabaseBrowserSingleton = getSupabaseClient();
  return supabaseBrowserSingleton as SupabaseClient;
}
