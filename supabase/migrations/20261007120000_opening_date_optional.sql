-- Settings rows can exist (e.g. a savings goal) before the opening balance is set.
alter table public.user_settings alter column opening_date drop not null, alter column opening_date drop default;
