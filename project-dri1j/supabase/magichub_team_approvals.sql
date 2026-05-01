-- MagicHub Team Approvals
-- Run in Supabase SQL editor, then: select pg_notify('pgrst', 'reload schema');

alter table public.profiles add column if not exists team_manager_id uuid references public.profiles(id) on delete set null;
comment on column public.profiles.team_manager_id is 'Manager assigned to consultant profile';

create table if not exists public.hub_consultant_requests (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending_admin_approval',
  full_name text not null,
  phone text,
  email text,
  address text,
  date_of_birth date,
  emergency_contact text,
  payout_method text,
  cash_app_tag text,
  bank_payout_notes text,
  notes text,
  id_document_path text,
  agreement_document_path text,
  w9_document_path text,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_consultant_requests_consultant_payout_check check (
    payout_method is null
    or lower(trim(payout_method)) in ('cash app', 'cash_app', 'cashapp')
  ),
  constraint hub_consultant_requests_cash_tag_required check (
    payout_method is null
    or lower(trim(payout_method)) not in ('cash app', 'cash_app', 'cashapp')
    or (cash_app_tag is not null and length(trim(cash_app_tag)) > 0)
  ),
  constraint hub_consultant_requests_status_check check (
    status in (
      'pending_admin_approval',
      'needs_correction',
      'active',
      'suspended',
      'removed',
      'rejected'
    )
  )
);

create index if not exists hub_consultant_requests_manager_idx on public.hub_consultant_requests(manager_id);
create index if not exists hub_consultant_requests_status_idx on public.hub_consultant_requests(status);

alter table public.hub_consultant_requests enable row level security;

drop policy if exists "hub_consultant_requests_select" on public.hub_consultant_requests;
create policy "hub_consultant_requests_select" on public.hub_consultant_requests
for select using (
  manager_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "hub_consultant_requests_insert" on public.hub_consultant_requests;
create policy "hub_consultant_requests_insert" on public.hub_consultant_requests
for insert with check (
  manager_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('sale_manager', 'admin'))
);

drop policy if exists "hub_consultant_requests_update" on public.hub_consultant_requests;
create policy "hub_consultant_requests_update" on public.hub_consultant_requests
for update using (
  manager_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  manager_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Notification table for in-app alerts (used by Team Approvals)
create table if not exists public.hub_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists hub_notifications_user_idx on public.hub_notifications (user_id, created_at desc);
create index if not exists hub_notifications_unread_idx on public.hub_notifications (user_id) where read_at is null;

alter table public.hub_notifications enable row level security;

drop policy if exists "hub_notifications_select_own" on public.hub_notifications;
create policy "hub_notifications_select_own" on public.hub_notifications
for select using (user_id = auth.uid());

drop policy if exists "hub_notifications_update_own" on public.hub_notifications;
create policy "hub_notifications_update_own" on public.hub_notifications
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "hub_notifications_insert_scoped" on public.hub_notifications;
create policy "hub_notifications_insert_scoped" on public.hub_notifications
for insert with check (
  user_id = auth.uid()
  or public.current_user_role() in ('admin', 'sale_manager')
);

-- Auto-notify all admins when a manager submits a request
create or replace function public.notify_admins_team_approval_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hub_notifications (user_id, kind, title, body)
  select p.id,
         'team_approval_pending',
         'New team member awaiting approval',
         coalesce(new.full_name, 'Unknown') || ' invited by manager ' || new.manager_id::text
  from public.profiles p
  where p.role = 'admin';
  return new;
end;
$$;

drop trigger if exists trg_notify_admins_team_approval_pending on public.hub_consultant_requests;
create trigger trg_notify_admins_team_approval_pending
after insert on public.hub_consultant_requests
for each row execute function public.notify_admins_team_approval_pending();
