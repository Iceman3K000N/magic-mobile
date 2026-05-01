-- Fix signup role assignment: manager signups should land as sale_manager
-- Run in Supabase SQL Editor, then: select pg_notify('pgrst', 'reload schema');

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
