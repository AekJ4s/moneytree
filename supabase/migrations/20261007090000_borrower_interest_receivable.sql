-- Interest / fees on someone else's portion (debts.borrower) become something they owe me (รอรับ)
-- at the moment they are posted, instead of my expense. Roll-over no longer books it a second time.

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
  v_creditor_id uuid;
  v_borrower text;
  v_interest numeric;
  v_book numeric;
  v_txn_id uuid;
  v_entry public.debt_entries;
begin
  select c.name || ' · ' || d.name, c.id, d.borrower into v_label, v_creditor_id, v_borrower
  from public.debts d join public.creditors c on c.id = d.creditor_id
  where d.id = p_debt_id and d.user_id = auth.uid();
  if not found then
    raise exception 'debt not found';
  end if;

  if p_installment_id is not null then
    select v_label || ' งวด ' || i.seq, i.interest into v_label, v_interest
    from public.debt_installments i
    where i.id = p_installment_id and i.debt_id = p_debt_id;
    if not found then
      raise exception 'installment does not belong to debt';
    end if;
  end if;

  -- What to book: interest/fees in full, or the interest part of an installment payment.
  v_book := case
    when not coalesce(p_record_expense, false) then 0
    when p_kind in ('interest', 'fee') then p_amount
    when p_kind = 'payment' and p_installment_id is not null then coalesce(v_interest, 0)
    else 0
  end;

  if v_book > 0 and v_borrower is not null then
    insert into public.receivable_entries (person, kind, amount, entry_date, note, debt_id)
    values (v_borrower, 'charge', v_book, p_date,
            case p_kind when 'fee' then 'ค่าธรรมเนียม ' else 'ดอกเบี้ย ' end || v_label, p_debt_id);
  elsif v_book > 0 then
    insert into public.transactions (type, amount, txn_date, category, note, source, account, payment_method, creditor_id)
    values ('expense', v_book, p_date, 'หนี้/ผ่อน',
            case p_kind when 'fee' then 'ค่าธรรมเนียม ' else 'ดอกเบี้ย ' end || v_label,
            'manual', v_label, 'debt', v_creditor_id)
    returning id into v_txn_id;
  end if;

  insert into public.debt_entries (debt_id, installment_id, kind, amount, entry_date, note, transaction_id)
  values (p_debt_id, p_installment_id, p_kind, p_amount, p_date, nullif(trim(p_note), ''), v_txn_id)
  returning * into v_entry;
  return v_entry;
end;
$$;

create or replace function public.rollover_revolving(
  p_debt_id uuid,
  p_date date,
  p_interest numeric,
  p_redraw numeric,
  p_book_interest numeric
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
  select c.name || ' · ' || v_debt.name into v_label from public.creditors c where c.id = v_debt.creditor_id;

  if coalesce(p_interest, 0) > 0 then
    insert into public.debt_entries (debt_id, kind, amount, entry_date, note)
    values (p_debt_id, 'interest', p_interest, p_date, 'ดอกเบี้ยตามใบแจ้งยอด');
    -- Someone else's portion: the newly posted interest is owed to me.
    if v_debt.borrower is not null then
      insert into public.receivable_entries (person, kind, amount, entry_date, note, debt_id)
      values (v_debt.borrower, 'charge', p_interest, p_date, 'ดอกเบี้ย ' || v_label, p_debt_id);
    end if;
  end if;

  select v_debt.principal + coalesce(sum(case when e.kind = 'payment' then -e.amount else e.amount end), 0)
  into v_balance from public.debt_entries e where e.debt_id = p_debt_id;
  if v_balance <= 0 then
    raise exception 'nothing to pay';
  end if;

  -- My own portion: the interest included in this payment is my expense.
  if coalesce(p_book_interest, 0) > 0 and v_debt.borrower is null then
    insert into public.transactions (type, amount, txn_date, category, note, source, account, payment_method, creditor_id)
    values ('expense', p_book_interest, p_date, 'หนี้/ผ่อน', 'ดอกเบี้ย ' || v_label, 'manual', v_label, 'debt', v_debt.creditor_id)
    returning id into v_txn_id;
  end if;

  insert into public.debt_entries (debt_id, kind, amount, entry_date, note, transaction_id)
  values (p_debt_id, 'payment', v_balance, p_date, 'ชำระเต็มยอด (หมุนรอบ)', v_txn_id);

  if coalesce(p_redraw, 0) > 0 then
    insert into public.debt_entries (debt_id, kind, amount, entry_date, note)
    values (p_debt_id, 'charge', p_redraw, p_date, 'เบิกใหม่ (หมุนรอบ)');
    if v_debt.borrower is not null then
      insert into public.receivable_entries (person, kind, amount, entry_date, note, debt_id)
      values (v_debt.borrower, 'lend', p_redraw, p_date, 'โอนเงินหมุน ' || v_label, p_debt_id);
    end if;
  end if;

  return v_balance;
end;
$$;
