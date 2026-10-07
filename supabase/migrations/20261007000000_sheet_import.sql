-- Spreadsheet import (template tab "รายการ").
alter type public.txn_source add value if not exists 'import';

alter table public.transactions
  add column account text,
  -- Fingerprint of an imported spreadsheet row; makes re-importing the same sheet a no-op.
  add column import_key text,
  add constraint transactions_user_import_key_key unique (user_id, import_key);
