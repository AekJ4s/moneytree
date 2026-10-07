-- Money already held in an asset before it was tracked here (e.g. an existing Dime portfolio).
-- Counts as invested principal and value, but never touches the account balance.
alter table public.assets
  add column opening_amount numeric(14, 2) not null default 0 check (opening_amount >= 0),
  add column opening_date date;
