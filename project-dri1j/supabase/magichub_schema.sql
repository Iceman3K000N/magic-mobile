-- MagicHub: inventory, sales, commission linkage, lead intake field
-- Run after magic_mobile_schema.sql in the same Supabase project.

-- -----------------------------------------------------------------------------
-- Leads: free-text "what they want" (intake)
-- -----------------------------------------------------------------------------
alter table public.leads add column if not exists what_they_want text;

-- -----------------------------------------------------------------------------
-- Inventory
-- -----------------------------------------------------------------------------
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  phone_model text not null,
  cost numeric(10,2) not null check (cost >= 0),
  selling_price numeric(10,2) not null check (selling_price >= 0),
  status text not null default 'Available' check (status in ('Available', 'Sold')),
  created_at timestamptz not null default now()
);

create index if not exists inventory_status_idx on public.inventory (status);

alter table public.inventory enable row level security;

drop policy if exists "inventory_select_auth" on public.inventory;
create policy "inventory_select_auth" on public.inventory
for select
using (auth.uid() is not null);

drop policy if exists "inventory_manage_admin" on public.inventory;
create policy "inventory_manage_admin" on public.inventory
for all
using (public.current_user_role() in ('admin', 'sale_manager'))
with check (public.current_user_role() in ('admin', 'sale_manager'));

-- -----------------------------------------------------------------------------
-- Sales
-- -----------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  inventory_id uuid references public.inventory(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  plan_name text not null default '',
  accessory_amount numeric(10,2) not null default 0 check (accessory_amount >= 0),
  phone_price numeric(10,2) not null default 0,
  inventory_cost numeric(10,2) not null default 0,
  total_sale numeric(10,2) not null check (total_sale >= 0),
  profit numeric(10,2) not null,
  commission_amount numeric(10,2) not null default 0,
  includes_phone boolean not null default false,
  includes_plan boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sales_contractor_created_idx on public.sales (contractor_id, created_at desc);
create index if not exists sales_created_idx on public.sales (created_at desc);

alter table public.sales enable row level security;

drop policy if exists "sales_select_own_or_admin" on public.sales;
create policy "sales_select_own_or_admin" on public.sales
for select
using (contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "sales_insert_own" on public.sales;
-- Inserts are performed by contractors via create_magichub_sale() (security definer); direct client inserts are admin/manager only.
create policy "sales_insert_admin" on public.sales
for insert
with check (public.current_user_role() in ('admin', 'sale_manager'));

drop policy if exists "sales_update_admin" on public.sales;
create policy "sales_update_admin" on public.sales
for update
using (public.current_user_role() in ('admin', 'sale_manager'))
with check (public.current_user_role() in ('admin', 'sale_manager'));

-- -----------------------------------------------------------------------------
-- Commissions: support sale-based rows (lead_id optional)
-- -----------------------------------------------------------------------------
alter table public.commissions alter column lead_id drop not null;

alter table public.commissions drop constraint if exists commissions_lead_id_key;

alter table public.commissions add column if not exists sale_id uuid references public.sales(id) on delete cascade;

drop index if exists commissions_lead_id_unique_partial;
create unique index commissions_lead_id_unique_partial on public.commissions (lead_id) where lead_id is not null;

drop index if exists commissions_sale_id_unique_partial;
create unique index commissions_sale_id_unique_partial on public.commissions (sale_id) where sale_id is not null;

alter table public.commissions drop constraint if exists commissions_lead_or_sale_chk;
alter table public.commissions add constraint commissions_lead_or_sale_chk
  check (
    (lead_id is not null and sale_id is null)
    or (lead_id is null and sale_id is not null)
  );

-- -----------------------------------------------------------------------------
-- hub_pricing_config (shared org pricing overrides)
-- -----------------------------------------------------------------------------
create table if not exists public.hub_pricing_config (
  id text primary key default 'default',
  payload jsonb not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.hub_pricing_config enable row level security;

drop policy if exists "hub_pricing_config_select_auth" on public.hub_pricing_config;
create policy "hub_pricing_config_select_auth" on public.hub_pricing_config
for select using (auth.uid() is not null);

drop policy if exists "hub_pricing_config_write_manager" on public.hub_pricing_config;
create policy "hub_pricing_config_write_manager" on public.hub_pricing_config
for all using (public.current_user_role() in ('admin', 'sale_manager'))
with check (public.current_user_role() in ('admin', 'sale_manager'));

insert into public.hub_pricing_config (id, payload)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Migration: sale lifecycle, audit log, pricing-based commission + payout eligibility
-- -----------------------------------------------------------------------------
alter table public.sales add column if not exists sale_status text not null default 'pending_approval';
alter table public.sales add column if not exists activation_status text not null default 'pending';
alter table public.sales add column if not exists payment_status text not null default 'pending';
alter table public.sales add column if not exists phone_returned boolean not null default false;
alter table public.sales add column if not exists bundled_with_service boolean not null default true;
alter table public.sales add column if not exists consultant_payout_expected numeric(10,2) not null default 0;
alter table public.sales add column if not exists manager_payout_expected numeric(10,2) not null default 0;
alter table public.sales add column if not exists tax_rate_percent numeric(10,4) default 0;
alter table public.sales add column if not exists taxable_subtotal_snapshot numeric(10,2) default 0;
alter table public.sales add column if not exists total_tax_snapshot numeric(10,2) default 0;

alter table public.commissions add column if not exists payout_eligible boolean not null default false;

create table if not exists public.hub_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.hub_audit_log enable row level security;

drop policy if exists "hub_audit_select_scope" on public.hub_audit_log;
create policy "hub_audit_select_scope" on public.hub_audit_log
for select using (
  actor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

drop policy if exists "hub_audit_insert_own" on public.hub_audit_log;
create policy "hub_audit_insert_own" on public.hub_audit_log
for insert with check (actor_id = auth.uid());

create or replace function public.magichub_refresh_commission_eligible(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.sales%rowtype;
  v_eligible boolean;
begin
  select * into r from public.sales where id = p_sale_id;
  if not found then
    return;
  end if;
  v_eligible := (
    lower(trim(coalesce(r.sale_status, ''))) = 'approved'
    and lower(trim(coalesce(r.activation_status, ''))) = 'completed'
    and lower(trim(coalesce(r.payment_status, ''))) = 'paid'
    and coalesce(r.phone_returned, false) = false
    and lower(trim(coalesce(r.sale_status, ''))) not in (
      'rejected', 'refunded', 'canceled', 'cancelled', 'fraudulent', 'pending_approval'
    )
  );
  update public.commissions
  set payout_eligible = v_eligible
  where sale_id = p_sale_id;
end;
$$;

grant execute on function public.magichub_refresh_commission_eligible(uuid) to authenticated;

create or replace function public.trg_sales_refresh_commission_eligible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.magichub_refresh_commission_eligible(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sales_commission_eligible on public.sales;
create trigger trg_sales_commission_eligible
after update of sale_status, activation_status, payment_status, phone_returned on public.sales
for each row execute function public.trg_sales_refresh_commission_eligible();

-- -----------------------------------------------------------------------------
-- create_magichub_sale: contractor attribution + catalog payouts + tax snapshot
-- -----------------------------------------------------------------------------
drop function if exists public.create_magichub_sale(uuid, uuid, text, numeric, boolean, boolean, text, text, uuid);
drop function if exists public.create_magichub_sale(uuid, uuid, text, numeric, boolean, boolean, text, text, uuid, numeric);
drop function if exists public.create_magichub_sale(uuid, uuid, text, numeric, boolean, boolean, text, text, uuid, numeric, numeric);
drop function if exists public.create_magichub_sale(uuid, uuid, text, numeric, boolean, boolean, text, text, uuid, numeric, numeric, numeric, numeric, boolean, numeric, numeric, numeric);

create or replace function public.create_magichub_sale(
  p_inventory_id uuid,
  p_lead_id uuid,
  p_plan_name text,
  p_accessory_amount numeric,
  p_includes_phone boolean,
  p_includes_plan boolean,
  p_customer_name text,
  p_customer_phone text,
  p_contractor_id uuid default null,
  p_discount numeric default 0,
  p_plan_charge_today numeric default 0,
  p_consultant_payout numeric default 0,
  p_manager_payout numeric default 0,
  p_bundled_with_service boolean default true,
  p_tax_rate_percent numeric default 0,
  p_taxable_subtotal numeric default 0,
  p_total_tax numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_target_contractor uuid;
  v_inv public.inventory%rowtype;
  v_total numeric(10,2);
  v_profit numeric(10,2);
  v_comm numeric(10,2);
  v_sale_id uuid;
  v_acc numeric(10,2) := coalesce(p_accessory_amount, 0);
  v_disc numeric(10,2) := greatest(coalesce(p_discount, 0), 0);
  v_plan_today numeric(10,2) := greatest(coalesce(p_plan_charge_today, 0), 0);
  v_consult numeric(10,2) := greatest(coalesce(p_consultant_payout, 0), 0);
  v_mgr numeric(10,2) := greatest(coalesce(p_manager_payout, 0), 0);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role, coalesce(is_active, true) into v_role, v_active
  from public.profiles where id = v_uid;

  if v_role is null then
    raise exception 'Profile missing';
  end if;
  if v_active is not true then
    raise exception 'Account inactive';
  end if;
  if v_role not in ('contractor', 'admin', 'sale_manager') then
    raise exception 'Forbidden';
  end if;

  if v_role in ('admin', 'sale_manager') and p_contractor_id is not null then
    v_target_contractor := p_contractor_id;
  else
    v_target_contractor := v_uid;
  end if;

  select * into v_inv from public.inventory where id = p_inventory_id for update;
  if not found then
    raise exception 'Phone not found';
  end if;
  if v_inv.status <> 'Available' then
    raise exception 'Phone not available';
  end if;

  if nullif(trim(coalesce(p_customer_name, '')), '') is null
     or nullif(trim(coalesce(p_customer_phone, '')), '') is null then
    raise exception 'Customer name and phone are required';
  end if;

  v_total := round(v_inv.selling_price + v_acc + v_plan_today - v_disc, 2);
  if v_total < 0 then
    raise exception 'Invalid total';
  end if;
  v_profit := round(v_total - v_inv.cost, 2);

  -- Commission total matches MagicHub pricing catalog (consultant + manager); no legacy $50/$15 unless passed as 0 from client.
  v_comm := round(v_consult + v_mgr, 2);

  insert into public.sales (
    contractor_id,
    lead_id,
    inventory_id,
    customer_name,
    customer_phone,
    plan_name,
    accessory_amount,
    phone_price,
    inventory_cost,
    total_sale,
    profit,
    commission_amount,
    includes_phone,
    includes_plan,
    sale_status,
    activation_status,
    payment_status,
    phone_returned,
    bundled_with_service,
    consultant_payout_expected,
    manager_payout_expected,
    tax_rate_percent,
    taxable_subtotal_snapshot,
    total_tax_snapshot
  ) values (
    v_target_contractor,
    p_lead_id,
    p_inventory_id,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    coalesce(nullif(trim(coalesce(p_plan_name, '')), ''), ''),
    v_acc,
    v_inv.selling_price,
    v_inv.cost,
    v_total,
    v_profit,
    v_comm,
    coalesce(p_includes_phone, true),
    coalesce(p_includes_plan, false),
    'pending_approval',
    'pending',
    'pending',
    false,
    coalesce(p_bundled_with_service, true),
    v_consult,
    v_mgr,
    greatest(coalesce(p_tax_rate_percent, 0), 0),
    greatest(coalesce(p_taxable_subtotal, 0), 0),
    greatest(coalesce(p_total_tax, 0), 0)
  )
  returning id into v_sale_id;

  update public.inventory
  set status = 'Sold'
  where id = p_inventory_id;

  insert into public.commissions (contractor_id, lead_id, sale_id, amount, type, paid, payout_eligible)
  values (v_target_contractor, null, v_sale_id, v_comm, 'Sale Commission', false, false);

  perform public.magichub_refresh_commission_eligible(v_sale_id);

  return v_sale_id;
end;
$$;

grant execute on function public.create_magichub_sale(uuid, uuid, text, numeric, boolean, boolean, text, text, uuid, numeric, numeric, numeric, numeric, boolean, numeric, numeric, numeric) to authenticated;
