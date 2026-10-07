-- Savings & investments: where money is kept (Dime, gold, cash at home, ...), their value over time,
-- and a savings goal that the home-page tree grows towards.

create type public.asset_kind as enum ('investment', 'savings', 'gold', 'cash', 'other');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind public.asset_kind not null default 'investment',
  -- Emoji, bundled image path ("/...") or a path in the creditor-logos bucket.
  icon text,
  target_amount numeric(14, 2) check (target_amount > 0),
  note text,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Market value snapshots (e.g. Dime portfolio value, gold at today's price).
create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  value numeric(14, 2) not null check (value >= 0),
  valued_on date not null,
  note text,
  created_at timestamptz not null default now()
);
create index asset_valuations_asset_idx on public.asset_valuations (asset_id, valued_on desc);

-- A savings/investment transaction can say where the money went (expense = deposit, income = withdrawal).
alter table public.transactions
  add column asset_id uuid references public.assets (id) on delete set null;
create index transactions_asset_id_idx on public.transactions (asset_id);

alter table public.user_settings
  add column savings_goal numeric(14, 2) check (savings_goal > 0);

alter table public.assets enable row level security;
alter table public.asset_valuations enable row level security;
create policy "owner_all" on public.assets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_all" on public.asset_valuations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
