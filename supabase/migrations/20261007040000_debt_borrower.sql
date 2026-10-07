-- Who actually uses the money of a debt (null = the owner). Lets one credit line be split,
-- e.g. a revolving balance used by "แม่" tracked separately from the owner's own balance.
alter table public.debts
  add column borrower text check (borrower is null or length(trim(borrower)) > 0);
