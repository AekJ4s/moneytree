-- Credit card statement cycle + recurring expenses charged to a card.

-- Statement cut-off day of a revolving debt (วันตัดรอบบัญชี); charges after it go to the next statement.
alter table public.debts
  add column statement_day smallint check (statement_day between 1 and 31);

-- Recurring item paid with a card / credit line: recording it also adds a charge to that debt.
alter table public.recurring_items
  add column pay_debt_id uuid references public.debts (id) on delete set null;
create index recurring_items_pay_debt_id_idx on public.recurring_items (pay_debt_id);

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

  insert into public.transactions (type, amount, txn_date, payee_id, category, note, source, recurring_id, account)
  values (v_item.type, coalesce(p_amount, v_item.amount), coalesce(p_date, v_item.next_due_date),
          v_item.payee_id, v_item.category, v_item.name, 'recurring', v_item.id,
          (select c.name || ' · ' || d.name from public.debts d join public.creditors c on c.id = d.creditor_id
           where d.id = v_item.pay_debt_id))
  returning * into v_txn;

  -- Paid by card: the card balance grows by the same amount (linked, so undoing removes both).
  if v_item.pay_debt_id is not null and v_item.type = 'expense' then
    insert into public.debt_entries (debt_id, kind, amount, entry_date, note, transaction_id)
    values (v_item.pay_debt_id, 'charge', v_txn.amount, v_txn.txn_date, v_item.name, v_txn.id);
  end if;

  update public.recurring_items
  set next_due_date = public.next_recurring_date(
    v_item.next_due_date, v_item.interval_unit, v_item.interval_count, v_item.due_day, v_item.due_last_day)
  where id = v_item.id;

  return v_txn;
end;
$$;

-- Any entry kind can now be booked as an expense: card purchases (charge), interest and fees
-- are real costs, while paying the card bill usually is not (the purchases were counted already).
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
  v_account text;
  v_txn_id uuid;
  v_entry public.debt_entries;
begin
  select c.name || ' · ' || d.name into v_label
  from public.debts d join public.creditors c on c.id = d.creditor_id
  where d.id = p_debt_id and d.user_id = auth.uid();
  if not found then
    raise exception 'debt not found';
  end if;
  v_account := v_label;

  if p_installment_id is not null then
    select v_label || ' งวด ' || i.seq into v_label
    from public.debt_installments i
    where i.id = p_installment_id and i.debt_id = p_debt_id;
    if not found then
      raise exception 'installment does not belong to debt';
    end if;
  end if;

  if p_record_expense then
    insert into public.transactions (type, amount, txn_date, category, note, source, account)
    values (
      'expense', p_amount, p_date,
      case p_kind when 'charge' then null else 'หนี้/ผ่อน' end,
      coalesce(nullif(trim(p_note), ''),
               case p_kind when 'interest' then 'ดอกเบี้ย ' when 'fee' then 'ค่าธรรมเนียม ' else '' end || v_label),
      'manual',
      v_account)
    returning id into v_txn_id;
  end if;

  insert into public.debt_entries (debt_id, installment_id, kind, amount, entry_date, note, transaction_id)
  values (p_debt_id, p_installment_id, p_kind, p_amount, p_date, nullif(trim(p_note), ''), v_txn_id)
  returning * into v_entry;
  return v_entry;
end;
$$;
