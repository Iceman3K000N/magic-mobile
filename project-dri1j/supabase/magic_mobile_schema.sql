-- Magic Mobile Contractor Sales Portal schema + RLS

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'contractor' check (role in ('admin', 'sale_manager', 'contractor')),
  is_active boolean not null default true,
  referral_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  customer_wants text not null check (customer_wants in ('Phone', 'Plan', 'Phone + Plan', 'Accessories')),
  current_carrier text,
  budget text,
  notes text,
  status text not null default 'New' check (status in ('New', 'Contacted', 'Closed', 'Lost')),
  phone_sold text,
  plan_sold text,
  accessory_amount numeric(10,2) default 0,
  total_sale_amount numeric(10,2) default 0,
  commission_amount numeric(10,2) default 0,
  commission_paid boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  type text not null default 'Lead Commission',
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create table if not exists public.training (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  target_table text not null,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'in_app')),
  event_type text not null,
  payload jsonb,
  sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.leads add column if not exists deleted_at timestamptz;
alter table public.leads add column if not exists deleted_by uuid references public.profiles(id);
alter table public.commissions add column if not exists deleted_at timestamptz;
alter table public.commissions add column if not exists deleted_by uuid references public.profiles(id);
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'sale_manager', 'contractor'));

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.commissions enable row level security;
alter table public.training enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.notification_events enable row level security;

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select
using (id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
for update
using (id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
with check (id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "leads_select_own_or_admin" on public.leads;
create policy "leads_select_own_or_admin" on public.leads
for select
using ((contractor_id = auth.uid() and deleted_at is null) or public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "leads_insert_own_or_admin" on public.leads;
create policy "leads_insert_own_or_admin" on public.leads
for insert
with check (contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "leads_update_admin_or_own" on public.leads;
create policy "leads_update_admin_or_own" on public.leads
for update
using (contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
with check (contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "commissions_select_own_or_admin" on public.commissions;
create policy "commissions_select_own_or_admin" on public.commissions
for select
using ((contractor_id = auth.uid() and deleted_at is null) or public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "commissions_admin_manage" on public.commissions;
create policy "commissions_admin_manage" on public.commissions
for all
using (public.current_user_role() in ('admin', 'sale_manager'))
with check (public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "training_read_authenticated" on public.training;
create policy "training_read_authenticated" on public.training
for select
using (auth.uid() is not null);

drop policy if exists "training_admin_manage" on public.training;
create policy "training_admin_manage" on public.training
for all
using (public.current_user_role() in ('admin', 'sale_manager'))
with check (public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "audit_logs_admin_read" on public.admin_audit_logs;
create policy "audit_logs_admin_read" on public.admin_audit_logs
for select
using (public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "audit_logs_admin_insert" on public.admin_audit_logs;
create policy "audit_logs_admin_insert" on public.admin_audit_logs
for insert
with check (public.current_user_role() in ('admin', 'sale_manager') and actor_id = auth.uid());

drop policy if exists "notifications_select_own_or_admin" on public.notification_events;
create policy "notifications_select_own_or_admin" on public.notification_events
for select
using (recipient_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "notifications_admin_insert" on public.notification_events;
create policy "notifications_admin_insert" on public.notification_events
for insert
with check (public.current_user_role() in ('admin', 'sale_manager'));

-- -----------------------------------------------------------------------------
-- Auto-create profile when a user signs up (stores full_name from auth metadata)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role text;
  v_role text;
begin
  v_requested_role := lower(trim(coalesce(new.raw_user_meta_data->>'requested_role', '')));
  v_role := case
    when v_requested_role in ('sale_manager', 'manager') then 'sale_manager'
    when v_requested_role in ('contractor', 'consultant', 'sales_consultant', 'sales consultant') then 'contractor'
    else 'contractor'
  end;

  insert into public.profiles (id, full_name, phone, role, referral_code)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), ''),
    v_role,
    'MM-' || upper(substring(new.id::text, 1, 8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Public referral landing helper (anon-safe lead capture)
-- -----------------------------------------------------------------------------
create or replace function public.submit_public_lead(
  p_referral_code text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_wants text default 'Phone',
  p_current_carrier text default null,
  p_budget text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contractor_id uuid;
  v_lead_id uuid;
begin
  select id into v_contractor_id
  from public.profiles
  where referral_code = p_referral_code
    and is_active = true
  limit 1;

  if v_contractor_id is null then
    raise exception 'Invalid referral code';
  end if;

  insert into public.leads (
    contractor_id,
    customer_name,
    customer_phone,
    customer_wants,
    current_carrier,
    budget,
    notes,
    status,
    commission_paid
  ) values (
    v_contractor_id,
    p_customer_name,
    p_customer_phone,
    coalesce(p_customer_wants, 'Phone'),
    nullif(trim(coalesce(p_current_carrier, '')), ''),
    nullif(trim(coalesce(p_budget, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    'New',
    false
  )
  returning id into v_lead_id;

  return v_lead_id;
end;
$$;

grant execute on function public.submit_public_lead(text, text, text, text, text, text, text) to anon, authenticated;
