-- Monthly "roll over" of a revolving balance: optionally post this statement's interest,
-- pay the whole balance, then draw the money again (e.g. Mom's 60,000 that is re-lent every month).
-- Only the interest is booked as an expense, because the principal just goes out and comes back.
create or replace function public.rollover_revolving(
  p_debt_id uuid,
  p_date date,
  p_interest numeric,
  p_redraw numeric,
  p_interest_expense numeric
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_debt public.debts;
  v_label text;
  v_balance numeric;
  v_txn_id uuid;
begin
  select d.* into v_debt from public.debts d
  where d.id = p_debt_id and d.user_id = auth.uid() and d.kind = 'revolving'
  for update;
  if not found then
    raise exception 'revolving debt not found';
  end if;

  select c.name || ' · ' || v_debt.name || coalesce(' (' || v_debt.borrower || ')', '') into v_label
  from public.creditors c where c.id = v_debt.creditor_id;

  if coalesce(p_interest, 0) > 0 then
    insert into public.debt_entries (debt_id, kind, amount, entry_date, note)
    values (p_debt_id, 'interest', p_interest, p_date, 'ดอกเบี้ยตามใบแจ้งยอด');
  end if;

  select v_debt.principal + coalesce(sum(case when e.kind = 'payment' then -e.amount else e.amount end), 0)
  into v_balance
  from public.debt_entries e where e.debt_id = p_debt_id;
  if v_balance <= 0 then
    raise exception 'nothing to pay';
  end if;

  if coalesce(p_interest_expense, 0) > 0 then
    insert into public.transactions (type, amount, txn_date, category, note, source)
    values ('expense', p_interest_expense, p_date, 'หนี้/ผ่อน', 'ดอกเบี้ย ' || v_label, 'manual')
    returning id into v_txn_id;
  end if;

  insert into public.debt_entries (debt_id, kind, amount, entry_date, note, transaction_id)
  values (p_debt_id, 'payment', v_balance, p_date, 'ชำระเต็มยอด (หมุนรอบ)', v_txn_id);

  if coalesce(p_redraw, 0) > 0 then
    insert into public.debt_entries (debt_id, kind, amount, entry_date, note)
    values (p_debt_id, 'charge', p_redraw, p_date, 'เบิกใหม่ (หมุนรอบ)');
  end if;

  return coalesce(p_redraw, 0);
end;
$$;

revoke execute on function public.rollover_revolving(uuid, date, numeric, numeric, numeric) from public, anon;
grant execute on function public.rollover_revolving(uuid, date, numeric, numeric, numeric) to authenticated;
