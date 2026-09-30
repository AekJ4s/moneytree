create type public.txn_type as enum ('income', 'expense');
create type public.txn_source as enum ('manual', 'slip', 'recurring');
create type public.rule_match_type as enum ('promptpay', 'keyword');
create type public.interval_unit as enum ('week', 'month', 'year');

create table public.payees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  default_type public.txn_type not null default 'expense',
  category text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.payee_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payee_id uuid not null references public.payees (id) on delete cascade,
  match_type public.rule_match_type not null,
  match_value text not null check (length(match_value) >= 2),
  created_at timestamptz not null default now(),
  unique (user_id, match_type, match_value)
);
create index payee_rules_payee_id_idx on public.payee_rules (payee_id);

create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type public.txn_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text,
  payee_id uuid references public.payees (id) on delete set null,
  interval_unit public.interval_unit not null default 'month',
  interval_count int not null default 1 check (interval_count between 1 and 60),
  next_due_date date not null,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index recurring_items_user_due_idx on public.recurring_items (user_id, next_due_date) where active;
create index recurring_items_payee_id_idx on public.recurring_items (payee_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type public.txn_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  txn_date date not null,
  txn_time time,
  payee_id uuid references public.payees (id) on delete set null,
  category text,
  note text,
  source public.txn_source not null default 'manual',
  recurring_id uuid references public.recurring_items (id) on delete set null,
  slip_ref text,
  slip_bank text,
  slip_image_path text,
  qr_payload text,
  created_at timestamptz not null default now(),
  unique (user_id, slip_ref)
);
create index transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index transactions_payee_id_idx on public.transactions (payee_id);
create index transactions_recurring_id_idx on public.transactions (recurring_id);

alter table public.payees enable row level security;
alter table public.payee_rules enable row level security;
alter table public.recurring_items enable row level security;
alter table public.transactions enable row level security;

create policy "owner_all" on public.payees for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_all" on public.payee_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_all" on public.recurring_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_all" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Records one occurrence of a recurring item and advances its next due date atomically.
create or replace function public.record_recurring(p_item_id uuid, p_amount numeric, p_date date)
returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.recurring_items;
  v_txn public.transactions;
begin
  select * into v_item from public.recurring_items
  where id = p_item_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'recurring item not found';
  end if;

  insert into public.transactions (type, amount, txn_date, payee_id, category, note, source, recurring_id)
  values (v_item.type, coalesce(p_amount, v_item.amount), coalesce(p_date, v_item.next_due_date),
          v_item.payee_id, v_item.category, v_item.name, 'recurring', v_item.id)
  returning * into v_txn;

  update public.recurring_items
  set next_due_date = (v_item.next_due_date + (v_item.interval_count || ' ' || v_item.interval_unit)::interval)::date
  where id = v_item.id;

  return v_txn;
end;
$$;

-- Skips the current occurrence without recording a transaction.
create or replace function public.skip_recurring(p_item_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.recurring_items
  set next_due_date = (next_due_date + (interval_count || ' ' || interval_unit)::interval)::date
  where id = p_item_id and user_id = auth.uid();
$$;

revoke execute on function public.record_recurring(uuid, numeric, date) from public, anon;
revoke execute on function public.skip_recurring(uuid) from public, anon;
grant execute on function public.record_recurring(uuid, numeric, date) to authenticated;
grant execute on function public.skip_recurring(uuid) to authenticated;

-- Private bucket for slip images; each user may only touch files under "<uid>/".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slips', 'slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "slips_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'slips' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "slips_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'slips' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "slips_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'slips' and (storage.foldername(name))[1] = (select auth.uid())::text);
