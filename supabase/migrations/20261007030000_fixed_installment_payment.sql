-- Bank-style installments: a fixed payment per installment where
-- principal = payment - actual interest (interest is taken from each statement).
alter table public.debts
  add column installment_amount numeric(12, 2) check (installment_amount > 0);

-- true once the row's principal/interest were entered from a statement; unconfirmed rows hold estimates.
alter table public.debt_installments
  add column confirmed boolean not null default false;
