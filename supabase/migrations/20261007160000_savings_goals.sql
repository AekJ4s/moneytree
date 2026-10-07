-- Several savings goals, each with its own tree; assets are dragged into a goal to count towards it.
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  icon text,
  deadline date,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.savings_goals enable row level security;
create policy "owner_all" on public.savings_goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.assets
  add column goal_id uuid references public.savings_goals (id) on delete set null;
create index assets_goal_id_idx on public.assets (goal_id);

-- The old single goal becomes "เป้าหมายหลัก", holding every existing asset (as before, all assets counted).
insert into public.savings_goals (user_id, name, target_amount, icon)
select user_id, 'เป้าหมายหลัก', savings_goal, '🎯' from public.user_settings where savings_goal is not null;

update public.assets a
set goal_id = g.id
from public.savings_goals g
where g.user_id = a.user_id and g.name = 'เป้าหมายหลัก' and a.goal_id is null;

alter table public.user_settings drop column savings_goal;
