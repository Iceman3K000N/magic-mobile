-- MagicHub go-live: quotes, activations, payments, documents, storage, sale metadata
-- Run after magichub_schema.sql. Then: select pg_notify('pgrst', 'reload schema');
-- Create Storage bucket in Dashboard if insert below fails (Storage → New bucket → magichub-docs, private).

-- -----------------------------------------------------------------------------
-- Storage bucket (private)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'magichub-docs',
  'magichub-docs',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "magichub_docs_insert_own" on storage.objects;
create policy "magichub_docs_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'magichub-docs'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "magichub_docs_select_own_or_manager" on storage.objects;
create policy "magichub_docs_select_own_or_manager"
on storage.objects for select to authenticated
using (
  bucket_id = 'magichub-docs'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.current_user_role() in ('admin', 'sale_manager')
  )
);

drop policy if exists "magichub_docs_update_own_or_manager" on storage.objects;
create policy "magichub_docs_update_own_or_manager"
on storage.objects for update to authenticated
using (
  bucket_id = 'magichub-docs'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or public.current_user_role() in ('admin', 'sale_manager')
  )
);

-- -----------------------------------------------------------------------------
-- hub_quotes (draft / submitted POS workflow)
-- -----------------------------------------------------------------------------
create table if not exists public.hub_quotes (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'converted', 'void')),
  payload jsonb not null default '{}',
  converted_sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_quotes_contractor_updated_idx on public.hub_quotes (contractor_id, updated_at desc);

alter table public.hub_quotes enable row level security;

drop policy if exists "hub_quotes_select_scope" on public.hub_quotes;
create policy "hub_quotes_select_scope" on public.hub_quotes
for select using (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

drop policy if exists "hub_quotes_insert_own" on public.hub_quotes;
create policy "hub_quotes_insert_own" on public.hub_quotes
for insert with check (contractor_id = auth.uid());

drop policy if exists "hub_quotes_update_own" on public.hub_quotes;
create policy "hub_quotes_update_own" on public.hub_quotes
for update using (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
)
with check (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

drop policy if exists "hub_quotes_delete_own" on public.hub_quotes;
create policy "hub_quotes_delete_own" on public.hub_quotes
for delete using (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

-- -----------------------------------------------------------------------------
-- hub_activations (per sale — replaces browser-only checklist)
-- -----------------------------------------------------------------------------
create table if not exists public.hub_activations (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  imei text,
  sim text,
  eid text,
  carrier text,
  checklist jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.hub_activations enable row level security;

drop policy if exists "hub_activations_select" on public.hub_activations;
create policy "hub_activations_select" on public.hub_activations
for select using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
);

drop policy if exists "hub_activations_write" on public.hub_activations;
create policy "hub_activations_write" on public.hub_activations
for all using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
);

-- -----------------------------------------------------------------------------
-- hub_sale_payments (installments / payment tracker)
-- -----------------------------------------------------------------------------
create table if not exists public.hub_sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  label text,
  sort_order int not null default 0,
  due_date date,
  status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'waived')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hub_sale_payments_sale_idx on public.hub_sale_payments (sale_id, sort_order);

alter table public.hub_sale_payments enable row level security;

drop policy if exists "hub_sale_payments_select" on public.hub_sale_payments;
create policy "hub_sale_payments_select" on public.hub_sale_payments
for select using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
);

drop policy if exists "hub_sale_payments_write" on public.hub_sale_payments;
create policy "hub_sale_payments_write" on public.hub_sale_payments
for all using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
);

-- -----------------------------------------------------------------------------
-- hub_documents (metadata; files live in storage.objects)
-- -----------------------------------------------------------------------------
create table if not exists public.hub_documents (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  title text,
  kind text,
  sale_id uuid references public.sales(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  quote_id uuid references public.hub_quotes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists hub_documents_sale_idx on public.hub_documents (sale_id);

alter table public.hub_documents enable row level security;

drop policy if exists "hub_documents_select" on public.hub_documents;
create policy "hub_documents_select" on public.hub_documents
for select using (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

drop policy if exists "hub_documents_insert" on public.hub_documents;
create policy "hub_documents_insert" on public.hub_documents
for insert with check (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

drop policy if exists "hub_documents_delete" on public.hub_documents;
create policy "hub_documents_delete" on public.hub_documents
for delete using (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

-- -----------------------------------------------------------------------------
-- hub_sale_metadata (workflow snapshot + manager notes)
-- -----------------------------------------------------------------------------
create table if not exists public.hub_sale_metadata (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  workflow_snapshot jsonb not null default '{}',
  manager_notes text,
  updated_at timestamptz not null default now()
);

alter table public.hub_sale_metadata enable row level security;

drop policy if exists "hub_sale_metadata_select" on public.hub_sale_metadata;
create policy "hub_sale_metadata_select" on public.hub_sale_metadata
for select using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
);

drop policy if exists "hub_sale_metadata_write" on public.hub_sale_metadata;
create policy "hub_sale_metadata_write" on public.hub_sale_metadata
for all using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (s.contractor_id = auth.uid() or public.current_user_role() in ('admin', 'sale_manager'))
  )
);

-- -----------------------------------------------------------------------------
-- hub_customers (CRM-style rows; optional link to lead)
-- -----------------------------------------------------------------------------
create table if not exists public.hub_customers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  address text,
  birthday text,
  id_type text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_customers_contractor_phone_idx on public.hub_customers (contractor_id, phone);

alter table public.hub_customers enable row level security;

drop policy if exists "hub_customers_select" on public.hub_customers;
create policy "hub_customers_select" on public.hub_customers
for select using (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

drop policy if exists "hub_customers_insert" on public.hub_customers;
create policy "hub_customers_insert" on public.hub_customers
for insert with check (contractor_id = auth.uid());

drop policy if exists "hub_customers_update" on public.hub_customers;
create policy "hub_customers_update" on public.hub_customers
for update using (
  contractor_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
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

-- Idempotent: add converted_sale_id if hub_quotes existed before this migration
alter table public.hub_quotes add column if not exists converted_sale_id uuid references public.sales(id) on delete set null;

-- -----------------------------------------------------------------------------
-- hub_customers: digits-only key for upsert / dedupe (run app after migration)
-- -----------------------------------------------------------------------------
alter table public.hub_customers add column if not exists phone_digits text;

update public.hub_customers
set phone_digits = regexp_replace(coalesce(phone, ''), '\D', '', 'g')
where phone_digits is null;

create index if not exists hub_customers_contractor_digits_lookup_idx
  on public.hub_customers (contractor_id, phone_digits);
