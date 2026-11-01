-- Simplify debts to rough numbers: each creditor has a total owed and a minimum payment,
-- updated by hand from the bank app. Payments are recorded against the creditor (cash out,
-- balance down). Schedules, interest, statement cycles, roll-overs and card charges are removed.

-- 1. Creditor-level figures.
alter table public.creditors
  add column balance numeric(14, 2) not null default 0 check (balance >= 0),
  add column min_payment numeric(12, 2) check (min_payment >= 0),
  add column min_payment_percent numeric(5, 2) check (min_payment_percent between 0 and 100),
  add column balance_updated_on date;

-- Carry over what is still owed from the detailed model.
with owed as (
  select d.creditor_id,
         sum(case
               when d.kind = 'revolving' then d.principal + coalesce((
                 select sum(case when e.kind = 'payment' then -e.amount else e.amount end)
                 from public.debt_entries e where e.debt_id = d.id), 0)
               else coalesce((
                 select sum(i.principal) from public.debt_installments i
                 where i.debt_id = d.id
                   and not exists (select 1 from public.debt_entries e where e.installment_id = i.id and e.kind = 'payment')), 0)
             end) as balance,
         max(d.min_payment_percent) as min_pct
  from public.debts d
  where d.closed_on is null
  group by d.creditor_id
)
update public.creditors c
set balance = greatest(0, round(owed.balance, 2)),
    min_payment_percent = owed.min_pct,
    balance_updated_on = current_date
from owed
where owed.creditor_id = c.id;

-- 2. Keep a copy of the detailed data before removing it.
create schema if not exists backup_debts_20261102;
revoke all on schema backup_debts_20261102 from public, anon, authenticated;
create table backup_debts_20261102.debts as select * from public.debts;
create table backup_debts_20261102.debt_installments as select * from public.debt_installments;
create table backup_debts_20261102.debt_entries as select * from public.debt_entries;

-- 3. Payments: money out of the account, the creditor's balance goes down.
create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creditor_id uuid not null references public.creditors (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null,
  note text,
  created_at timestamptz not null default now()
);
create index debt_payments_creditor_idx on public.debt_payments (creditor_id, paid_on desc);
alter table public.debt_payments enable row level security;
create policy "owner_all" on public.debt_payments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.pay_debt(p_creditor_id uuid, p_amount numeric, p_date date, p_note text)
returns public.debt_payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.debt_payments;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  update public.creditors set balance = greatest(0, balance - p_amount)
  where id = p_creditor_id and user_id = auth.uid();
  if not found then
    raise exception 'creditor not found';
  end if;
  insert into public.debt_payments (creditor_id, amount, paid_on, note)
  values (p_creditor_id, p_amount, p_date, nullif(trim(p_note), ''))
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Undo a payment: remove it and add the amount back to the balance.
create or replace function public.delete_debt_payment(p_payment_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.debt_payments;
begin
  delete from public.debt_payments where id = p_payment_id and user_id = auth.uid() returning * into v_payment;
  if found then
    update public.creditors set balance = balance + v_payment.amount where id = v_payment.creditor_id;
  end if;
end;
$$;

revoke execute on function public.pay_debt(uuid, numeric, date, text) from public, anon;
revoke execute on function public.delete_debt_payment(uuid) from public, anon;
grant execute on function public.pay_debt(uuid, numeric, date, text) to authenticated;
grant execute on function public.delete_debt_payment(uuid) to authenticated;

-- 4. Remove the detailed model. Card expenses stay as a label (no automatic charges).
drop trigger if exists transactions_sync_card_charge_ins on public.transactions;
drop trigger if exists transactions_sync_card_charge_upd on public.transactions;
drop trigger if exists transactions_sync_card_charge_del on public.transactions;
drop function if exists public.sync_card_charge();
drop function if exists public.card_debt_for(uuid, date);
drop function if exists public.add_debt_entry(uuid, public.debt_entry_kind, numeric, date, text, uuid, boolean);
drop function if exists public.delete_debt_entry(uuid);
drop function if exists public.rollover_revolving(uuid, date, numeric, numeric, numeric);
drop function if exists public.mark_installments_paid(uuid[], boolean);
alter table public.receivable_entries drop column if exists debt_id;
drop table public.debt_entries;
drop table public.debt_installments;
drop table public.debts;
-- The enum types stay: the backup tables still use them.

-- 5. Real balance now uses debt payments for money paid to creditors.
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
    select -p.amount, p.paid_on from public.debt_payments p
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
