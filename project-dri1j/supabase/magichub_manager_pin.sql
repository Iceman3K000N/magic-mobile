-- 4-digit PIN for managers/admins (hash only; verified via Next.js API + service role).
-- Apply in Supabase SQL Editor, then: select pg_notify('pgrst', 'reload schema');

create table if not exists public.manager_auth_pins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  failed_attempts int not null default 0,
  locked_until timestamptz
);

comment on table public.manager_auth_pins is 'Stores scrypt hash of manager/admin PIN; no client access — use API routes only.';

alter table public.manager_auth_pins enable row level security;

-- Deny all direct PostgREST access; service role bypasses RLS for API routes.
