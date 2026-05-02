-- Add store_lead (PIN-required elevated floor role) and allow create_magichub_sale for that role.
-- Run in Supabase SQL Editor, then: select pg_notify('pgrst', 'reload schema');

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'sale_manager', 'contractor', 'store_lead'));

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
  if v_role not in ('contractor', 'admin', 'sale_manager', 'store_lead') then
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
