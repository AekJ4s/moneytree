-- Credit line settings live on the creditor (the card / bank), not on each debt.
alter table public.creditors
  add column credit_limit numeric(12, 2) check (credit_limit >= 0),
  add column statement_day smallint check (statement_day between 1 and 31),
  add column due_day smallint check (due_day between 1 and 31);

-- Recurring expenses are charged to a creditor (e.g. "KTC") instead of a pre-made debt.
alter table public.recurring_items
  add column pay_creditor_id uuid references public.creditors (id) on delete set null;
create index recurring_items_pay_creditor_id_idx on public.recurring_items (pay_creditor_id);

update public.recurring_items r
set pay_creditor_id = d.creditor_id
from public.debts d
where d.id = r.pay_debt_id;

alter table public.recurring_items drop column pay_debt_id;

-- The owner's open revolving balance with a creditor ("บัตรเครดิต"); created on first use.
create or replace function public.card_debt_for(p_creditor_id uuid, p_date date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_debt_id uuid;
  v_creditor public.creditors;
begin
  select * into v_creditor from public.creditors where id = p_creditor_id and user_id = auth.uid();
  if not found then
    raise exception 'creditor not found';
  end if;

  select d.id into v_debt_id from public.debts d
  where d.creditor_id = p_creditor_id and d.kind = 'revolving' and d.closed_on is null and d.borrower is null
  order by d.created_at
  limit 1;

  if v_debt_id is null then
    insert into public.debts (creditor_id, name, kind, principal, start_date, statement_day, due_day)
    values (p_creditor_id, 'บัตรเครดิต', 'revolving', 0, p_date, v_creditor.statement_day, v_creditor.due_day)
    returning id into v_debt_id;
  end if;
  return v_debt_id;
end;
$$;

create or replace function public.record_recurring(p_item_id uuid, p_amount numeric, p_date date)
returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.recurring_items;
  v_txn public.transactions;
  v_date date;
begin
  select * into v_item from public.recurring_items
  where id = p_item_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'recurring item not found';
  end if;
  v_date := coalesce(p_date, v_item.next_due_date);

  insert into public.transactions (type, amount, txn_date, payee_id, category, note, source, recurring_id, account)
  values (v_item.type, coalesce(p_amount, v_item.amount), v_date,
          v_item.payee_id, v_item.category, v_item.name, 'recurring', v_item.id,
          (select c.name from public.creditors c where c.id = v_item.pay_creditor_id))
  returning * into v_txn;

  -- Charged to a card: the card balance grows by the same amount (linked, so undoing removes both).
  if v_item.pay_creditor_id is not null and v_item.type = 'expense' then
    insert into public.debt_entries (debt_id, kind, amount, entry_date, note, transaction_id)
    values (public.card_debt_for(v_item.pay_creditor_id, v_date), 'charge', v_txn.amount, v_date, v_item.name, v_txn.id);
  end if;

  update public.recurring_items
  set next_due_date = public.next_recurring_date(
    v_item.next_due_date, v_item.interval_unit, v_item.interval_count, v_item.due_day, v_item.due_last_day)
  where id = v_item.id;

  return v_txn;
end;
$$;

revoke execute on function public.card_debt_for(uuid, date) from public, anon;
grant execute on function public.card_debt_for(uuid, date) to authenticated;
