-- Income sources ("jobs"): where income comes from, e.g. a salary from company A, a side project,
-- or money from parents. Recurring income must say which source it belongs to (enforced in the UI).
create type public.income_source_kind as enum ('job', 'project', 'family', 'other');

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind public.income_source_kind not null default 'job',
  icon text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.income_sources enable row level security;
create policy "owner_all" on public.income_sources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.recurring_items
  add column income_source_id uuid references public.income_sources (id) on delete set null;
alter table public.transactions
  add column income_source_id uuid references public.income_sources (id) on delete set null;
create index recurring_items_income_source_idx on public.recurring_items (income_source_id);
create index transactions_income_source_idx on public.transactions (income_source_id);

-- Recording a recurring item now also carries its income source onto the transaction.
create or replace function public.record_recurring(p_item_id uuid, p_amount numeric, p_date date)
returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.recurring_items;
  v_txn public.transactions;
  v_card boolean;
begin
  select * into v_item from public.recurring_items
  where id = p_item_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'recurring item not found';
  end if;
  v_card := v_item.pay_creditor_id is not null and v_item.type = 'expense';

  insert into public.transactions
    (type, amount, txn_date, payee_id, category, note, source, recurring_id, payment_method, creditor_id, account,
     income_source_id)
  values (v_item.type, coalesce(p_amount, v_item.amount), coalesce(p_date, v_item.next_due_date),
          v_item.payee_id, v_item.category, v_item.name, 'recurring', v_item.id,
          case when v_card then 'card' else 'cash' end::public.payment_method,
          case when v_card then v_item.pay_creditor_id end,
          (select c.name from public.creditors c where c.id = v_item.pay_creditor_id and v_card),
          case when v_item.type = 'income' then v_item.income_source_id end)
  returning * into v_txn;

  update public.recurring_items
  set next_due_date = public.next_recurring_date(
    v_item.next_due_date, v_item.interval_unit, v_item.interval_count, v_item.due_day, v_item.due_last_day)
  where id = v_item.id;

  return v_txn;
end;
$$;
