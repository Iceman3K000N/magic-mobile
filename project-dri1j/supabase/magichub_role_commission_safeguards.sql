-- Role-based commission and production safeguards for MagicHub
-- Run after magichub_schema.sql and magichub_go_live.sql

alter table public.sales add column if not exists created_by_role text;
alter table public.sales add constraint sales_created_by_role_check check (
  created_by_role in ('Consultant', 'Manager') or created_by_role is null
);

alter table public.commissions add column if not exists payout_method text;
alter table public.commissions add column if not exists payout_date timestamptz;
alter table public.commissions add column if not exists payout_reference text;
alter table public.commissions add column if not exists paid_by uuid references public.profiles(id) on delete set null;
alter table public.commissions
  add constraint commissions_payout_method_check
  check (payout_method in ('cash_app', 'mercury_bank') or payout_method is null);

-- Manager-created sales: manager acts as consultant and gets no override.
create or replace function public.enforce_manager_created_sale_split()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.created_by_role, '') = 'Manager' then
    new.manager_payout_expected := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_manager_created_sale_split on public.sales;
create trigger trg_enforce_manager_created_sale_split
before insert or update of created_by_role, manager_payout_expected
on public.sales
for each row
execute function public.enforce_manager_created_sale_split();

-- Prevent double commission assignment on same sale to the same user
create unique index if not exists commissions_sale_contractor_unique_idx
  on public.commissions (sale_id, contractor_id)
  where sale_id is not null and deleted_at is null;

-- Commission eligibility strict gate.
create or replace function public.sale_commission_gate_ok(r public.sales)
returns boolean
language sql
stable
as $$
  select
    lower(trim(coalesce(r.sale_status, ''))) = 'approved'
    and lower(trim(coalesce(r.activation_status, ''))) = 'completed'
    and lower(trim(coalesce(r.payment_status, ''))) = 'paid'
    and coalesce(r.phone_returned, false) = false
    and (r.commission_hold_until is null or r.commission_hold_until <= now());
$$;

-- Optional: enforce per-IMEI single active sale at DB layer (if sales table stores imei directly in your schema).
-- create unique index if not exists sales_unique_imei_active_idx
--   on public.sales (imei)
--   where sale_status not in ('rejected', 'refunded', 'canceled', 'cancelled');
