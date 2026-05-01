-- Promo codes + ID verification link system for MagicHub

create table if not exists public.hub_promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('dollar_off','free_month','free_addon','multi_line')),
  status text not null default 'draft' check (status in ('draft','active','disabled')),
  amount_off numeric(10,2),
  free_month boolean not null default false,
  free_addon_case boolean not null default false,
  applies_to text not null default 'plan' check (applies_to in ('phone_bundle','plan','add_ons','plan_55_magic_max','multi_line')),
  rule_text text,
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer,
  usage_count integer not null default 0,
  notes text,
  admin_approval_required boolean not null default false,
  manager_only boolean not null default false,
  customer_type text not null default 'all' check (customer_type in ('all','first_time','returning')),
  allow_stacking boolean not null default false,
  max_stack_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales add column if not exists promo_code text;
alter table public.sales add column if not exists promo_discount_amount numeric(10,2);
alter table public.sales add column if not exists promo_stack_count integer;
alter table public.sales add column if not exists promo_override_used boolean;
alter table public.sales add column if not exists promo_applied_at timestamptz;

alter table public.sales add column if not exists id_verification_status text default 'not_sent';
alter table public.sales add column if not exists id_upload_sent_at timestamptz;
alter table public.sales add column if not exists id_uploaded_at timestamptz;
alter table public.sales add column if not exists id_verified_at timestamptz;
alter table public.sales drop constraint if exists sales_id_verification_status_check;
alter table public.sales
  add constraint sales_id_verification_status_check
  check (id_verification_status in ('not_sent','waiting','uploaded','verified'));

create table if not exists public.hub_id_verification_links (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.hub_promo_codes enable row level security;
alter table public.hub_id_verification_links enable row level security;

drop policy if exists promo_codes_admin_manage on public.hub_promo_codes;
create policy promo_codes_admin_manage on public.hub_promo_codes
for all
using (public.current_user_role() in ('admin','sale_manager'))
with check (public.current_user_role() in ('admin','sale_manager'));

drop policy if exists id_links_admin_manage on public.hub_id_verification_links;
create policy id_links_admin_manage on public.hub_id_verification_links
for all
using (public.current_user_role() in ('admin','sale_manager'))
with check (public.current_user_role() in ('admin','sale_manager'));
