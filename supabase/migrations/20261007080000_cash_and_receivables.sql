-- Transaction-centred money model:
--  * every expense says how it was paid: from the account (cash), on a card, or as part of a debt payment;
--  * card expenses automatically become a charge on that creditor's card balance (รอจ่าย);
--  * money lent to people is tracked as receivables (รอรับ);
--  * one account with an opening balance gives the real balance (ยอดเงินจริง).

-- cash = moves the account balance; card = charged to a creditor's card; debt = booked as part of a
-- debt payment whose cash movement is recorded on the debt itself (e.g. installment interest).
create type public.payment_method as enum ('cash', 'card', 'debt');

alter table public.transactions
  add column payment_method public.payment_method not null default 'cash',
  add column creditor_id uuid references public.creditors (id) on delete set null,
  add constraint transactions_card_needs_creditor check (payment_method <> 'card' or creditor_id is not null);
create index transactions_creditor_id_idx on public.transactions (creditor_id);

-- ---------------------------------------------------------------------------------------------
-- Card expenses <-> card charges stay in sync (insert / edit / delete the expense).
create or replace function public.sync_card_charge()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.debt_entries where transaction_id = old.id and kind = 'charge';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.payment_method = 'card' and new.type = 'expense' then
    insert into public.debt_entries (user_id, debt_id, kind, amount, entry_date, note, transaction_id)
    values (new.user_id, public.card_debt_for(new.creditor_id, new.txn_date), 'charge', new.amount, new.txn_date,
            coalesce(new.note, 'รายจ่ายผ่านบัตร'), new.id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger transactions_sync_card_charge_ins
  after insert on public.transactions
  for each row execute function public.sync_card_charge();
create trigger transactions_sync_card_charge_upd
  after update of type, amount, txn_date, payment_method, creditor_id, note on public.transactions
  for each row execute function public.sync_card_charge();
create trigger transactions_sync_card_charge_del
  before delete on public.transactions
  for each row execute function public.sync_card_charge();

-- Recurring items charged to a card now just create a card expense; the trigger adds the charge.
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
    (type, amount, txn_date, payee_id, category, note, source, recurring_id, payment_method, creditor_id, account)
  values (v_item.type, coalesce(p_amount, v_item.amount), coalesce(p_date, v_item.next_due_date),
          v_item.payee_id, v_item.category, v_item.name, 'recurring', v_item.id,
          case when v_card then 'card' else 'cash' end::public.payment_method,
          case when v_card then v_item.pay_creditor_id end,
          (select c.name from public.creditors c where c.id = v_item.pay_creditor_id and v_card))
  returning * into v_txn;

  update public.recurring_items
  set next_due_date = public.next_recurring_date(
    v_item.next_due_date, v_item.interval_unit, v_item.interval_count, v_item.due_day, v_item.due_last_day)
  where id = v_item.id;

  return v_txn;
end;
$$;

-- Debt entries: a payment is a cash movement, never an expense by itself. What can be an expense:
-- interest/fees, and the interest part of an installment being paid (booked with method 'debt').
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
  v_interest numeric;
  v_expense numeric;
  v_txn_id uuid;
  v_entry public.debt_entries;
begin
  select c.name || ' · ' || d.name, c.id into v_label, v_creditor_id
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

  v_expense := case
    when not coalesce(p_record_expense, false) then 0
    when p_kind in ('interest', 'fee') then p_amount
    when p_kind = 'payment' and p_installment_id is not null then coalesce(v_interest, 0)
    else 0
  end;

  if v_expense > 0 then
    insert into public.transactions (type, amount, txn_date, category, note, source, account, payment_method, creditor_id)
    values ('expense', v_expense, p_date, 'หนี้/ผ่อน',
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

-- ---------------------------------------------------------------------------------------------
-- Receivables: money other people owe me.
create type public.receivable_kind as enum ('lend', 'collect', 'charge');

create table public.receivable_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person text not null check (length(trim(person)) > 0),
  -- lend = I give money (cash out); collect = they pay me back (cash in);
  -- charge = they owe more without cash moving (e.g. interest I paid for them).
  kind public.receivable_kind not null,
  amount numeric(12, 2) not null check (amount > 0),
  entry_date date not null,
  note text,
  debt_id uuid references public.debts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index receivable_entries_user_person_idx on public.receivable_entries (user_id, person);
create index receivable_entries_debt_id_idx on public.receivable_entries (debt_id);
alter table public.receivable_entries enable row level security;
create policy "owner_all" on public.receivable_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Single account: balance at the end of opening_date; later movements adjust it.
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  opening_balance numeric(14, 2) not null default 0,
  opening_date date not null default current_date,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "owner_all" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Real account balance and receivables per person.
create or replace function public.balance_overview()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select coalesce((select opening_balance from public.user_settings where user_id = auth.uid()), 0) as opening_balance,
           (select opening_date from public.user_settings where user_id = auth.uid()) as opening_date
  ),
  moves as (
    select case t.type when 'income' then t.amount else -t.amount end as amount, t.txn_date as d
    from public.transactions t where t.payment_method = 'cash'
    union all
    select case e.kind when 'payment' then -e.amount else e.amount end, e.entry_date
    from public.debt_entries e
    where e.kind = 'payment' or (e.kind = 'charge' and e.transaction_id is null)
    union all
    select case r.kind when 'lend' then -r.amount else r.amount end, r.entry_date
    from public.receivable_entries r where r.kind in ('lend', 'collect')
  )
  select json_build_object(
    'configured', (select opening_date from s) is not null,
    'opening_balance', (select opening_balance from s),
    'opening_date', (select opening_date from s),
    'cash_balance', (select opening_balance from s)
      + coalesce((select sum(amount) from moves where (select opening_date from s) is not null and d > (select opening_date from s)), 0),
    'receivables', coalesce((
      select json_agg(json_build_object('person', person, 'amount', amount) order by amount desc)
      from (
        select person, sum(case kind when 'collect' then -amount else amount end) as amount
        from public.receivable_entries group by person
      ) p where amount <> 0
    ), '[]'::json)
  );
$$;

-- Monthly roll-over of a revolving balance. For someone else's portion (borrower), the redraw is
-- lent straight back to them and the interest becomes something they owe me instead of my expense.
drop function if exists public.rollover_revolving(uuid, date, numeric, numeric, numeric);
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
  end if;

  select v_debt.principal + coalesce(sum(case when e.kind = 'payment' then -e.amount else e.amount end), 0)
  into v_balance from public.debt_entries e where e.debt_id = p_debt_id;
  if v_balance <= 0 then
    raise exception 'nothing to pay';
  end if;

  if coalesce(p_book_interest, 0) > 0 then
    if v_debt.borrower is not null then
      insert into public.receivable_entries (person, kind, amount, entry_date, note, debt_id)
      values (v_debt.borrower, 'charge', p_book_interest, p_date, 'ดอกเบี้ย ' || v_label, p_debt_id);
    else
      insert into public.transactions (type, amount, txn_date, category, note, source, account, payment_method, creditor_id)
      values ('expense', p_book_interest, p_date, 'หนี้/ผ่อน', 'ดอกเบี้ย ' || v_label, 'manual', v_label, 'debt', v_debt.creditor_id)
      returning id into v_txn_id;
    end if;
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

revoke execute on function public.balance_overview() from public, anon;
revoke execute on function public.rollover_revolving(uuid, date, numeric, numeric, numeric) from public, anon;
grant execute on function public.balance_overview() to authenticated;
grant execute on function public.rollover_revolving(uuid, date, numeric, numeric, numeric) to authenticated;
