-- Debt tracking: creditors (LINE BK, KTC, ...) own one or more debts of different kinds.
create type public.debt_kind as enum ('revolving', 'installment', 'paylater');
-- none = 0%, annual / monthly = rate in % per year / month, manual = typed per installment.
create type public.interest_mode as enum ('none', 'annual', 'monthly', 'manual');
create type public.interest_method as enum ('flat', 'reducing');
create type public.debt_entry_kind as enum ('payment', 'charge', 'interest', 'fee');

create table public.creditors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- "/creditors/x.webp" = bundled asset; anything else = path in the creditor-logos bucket.
  logo text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creditor_id uuid not null references public.creditors (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind public.debt_kind not null,
  -- Installments: amount financed. Revolving: balance when tracking started.
  principal numeric(12, 2) not null check (principal >= 0),
  interest_mode public.interest_mode not null default 'none',
  interest_rate numeric(8, 4) check (interest_rate >= 0),
  interest_method public.interest_method not null default 'flat',
  term_months int check (term_months between 1 and 600),
  start_date date not null default current_date,
  first_due_date date,
  due_day smallint check (due_day between 1 and 31),
  credit_limit numeric(12, 2) check (credit_limit >= 0),
  min_payment_percent numeric(5, 2) check (min_payment_percent between 0 and 100),
  closed_on date,
  note text,
  created_at timestamptz not null default now()
);
create index debts_creditor_id_idx on public.debts (creditor_id);
create index debts_user_id_idx on public.debts (user_id);

create table public.debt_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  debt_id uuid not null references public.debts (id) on delete cascade,
  seq int not null check (seq >= 1),
  due_date date not null,
  principal numeric(12, 2) not null check (principal >= 0),
  interest numeric(12, 2) not null default 0 check (interest >= 0),
  unique (debt_id, seq)
);
create index debt_installments_user_due_idx on public.debt_installments (user_id, due_date);

create table public.debt_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  debt_id uuid not null references public.debts (id) on delete cascade,
  installment_id uuid references public.debt_installments (id) on delete cascade,
  kind public.debt_entry_kind not null,
  amount numeric(12, 2) not null check (amount > 0),
  entry_date date not null,
  note text,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index debt_entries_debt_id_idx on public.debt_entries (debt_id);
create index debt_entries_transaction_id_idx on public.debt_entries (transaction_id);
-- An installment can only be paid once.
create unique index debt_entries_installment_payment_key
  on public.debt_entries (installment_id) where kind = 'payment' and installment_id is not null;

alter table public.creditors enable row level security;
alter table public.debts enable row level security;
alter table public.debt_installments enable row level security;
alter table public.debt_entries enable row level security;

create policy "owner_all" on public.creditors for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_all" on public.debts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_all" on public.debt_installments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_all" on public.debt_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Records a debt entry; a payment can also be booked as an expense transaction (atomic).
create or replace function public.add_debt_entry(
  p_debt_id uuid,
  p_kind public.debt_entry_kind,
  p_amount numeric,
  p_date date,
  p_note text,
  p_installment_id uuid,
  p_record_expense boolean
)
returns public.debt_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_label text;
  v_txn_id uuid;
  v_entry public.debt_entries;
begin
  select c.name || ' · ' || d.name into v_label
  from public.debts d join public.creditors c on c.id = d.creditor_id
  where d.id = p_debt_id and d.user_id = auth.uid();
  if not found then
    raise exception 'debt not found';
  end if;

  if p_installment_id is not null then
    select v_label || ' งวด ' || i.seq into v_label
    from public.debt_installments i
    where i.id = p_installment_id and i.debt_id = p_debt_id;
    if not found then
      raise exception 'installment does not belong to debt';
    end if;
  end if;

  if p_kind = 'payment' and p_record_expense then
    insert into public.transactions (type, amount, txn_date, category, note, source)
    values ('expense', p_amount, p_date, 'หนี้/ผ่อน', coalesce(nullif(trim(p_note), ''), v_label), 'manual')
    returning id into v_txn_id;
  end if;

  insert into public.debt_entries (debt_id, installment_id, kind, amount, entry_date, note, transaction_id)
  values (p_debt_id, p_installment_id, p_kind, p_amount, p_date, nullif(trim(p_note), ''), v_txn_id)
  returning * into v_entry;
  return v_entry;
end;
$$;

-- Deletes an entry together with the expense transaction it created, if any.
create or replace function public.delete_debt_entry(p_entry_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_txn_id uuid;
begin
  delete from public.debt_entries
  where id = p_entry_id and user_id = auth.uid()
  returning transaction_id into v_txn_id;
  if v_txn_id is not null then
    delete from public.transactions where id = v_txn_id and user_id = auth.uid();
  end if;
end;
$$;

revoke execute on function public.add_debt_entry(uuid, public.debt_entry_kind, numeric, date, text, uuid, boolean) from public, anon;
revoke execute on function public.delete_debt_entry(uuid) from public, anon;
grant execute on function public.add_debt_entry(uuid, public.debt_entry_kind, numeric, date, text, uuid, boolean) to authenticated;
grant execute on function public.delete_debt_entry(uuid) to authenticated;

-- Private bucket for custom creditor logos, under "<uid>/".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creditor-logos', 'creditor-logos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp']);

create policy "creditor_logos_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'creditor-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "creditor_logos_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'creditor-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "creditor_logos_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'creditor-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
