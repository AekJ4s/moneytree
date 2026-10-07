-- Monthly/yearly recurring items can be anchored to a day of the month ("every 25th")
-- or to the last day of the month. Anchoring prevents drift (Jan 31 -> Feb 28 -> Mar 28 ...).
alter table public.recurring_items
  add column due_day smallint check (due_day between 1 and 31),
  add column due_last_day boolean not null default false,
  add constraint recurring_items_due_anchor_check check (not (due_last_day and due_day is not null));

-- Existing monthly/yearly items keep the day they are currently scheduled on.
update public.recurring_items
set due_day = extract(day from next_due_date)::smallint
where interval_unit in ('month', 'year') and due_day is null and not due_last_day;

-- Next due date after p_from according to the item's interval and day anchor.
-- Mirrors src/lib/recurrence.ts (nextDueDate).
create or replace function public.next_recurring_date(
  p_from date,
  p_unit public.interval_unit,
  p_count int,
  p_due_day smallint,
  p_due_last_day boolean
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_month_start date;
  v_month_end date;
begin
  if p_unit = 'week' then
    return p_from + 7 * p_count;
  end if;

  v_month_start := (date_trunc('month', p_from)
    + make_interval(months => case when p_unit = 'year' then 12 * p_count else p_count end))::date;
  v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;

  if p_due_last_day then
    return v_month_end;
  elsif p_due_day is not null then
    -- Months shorter than the anchor day fall on their last day (31st -> Feb 28/29).
    return v_month_start + (least(p_due_day, extract(day from v_month_end)::int) - 1);
  end if;
  return (p_from + make_interval(months => case when p_unit = 'year' then 12 * p_count else p_count end))::date;
end;
$$;

create or replace function public.record_recurring(p_item_id uuid, p_amount numeric, p_date date)
returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.recurring_items;
  v_txn public.transactions;
begin
  select * into v_item from public.recurring_items
  where id = p_item_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'recurring item not found';
  end if;

  insert into public.transactions (type, amount, txn_date, payee_id, category, note, source, recurring_id)
  values (v_item.type, coalesce(p_amount, v_item.amount), coalesce(p_date, v_item.next_due_date),
          v_item.payee_id, v_item.category, v_item.name, 'recurring', v_item.id)
  returning * into v_txn;

  update public.recurring_items
  set next_due_date = public.next_recurring_date(
    v_item.next_due_date, v_item.interval_unit, v_item.interval_count, v_item.due_day, v_item.due_last_day)
  where id = v_item.id;

  return v_txn;
end;
$$;

create or replace function public.skip_recurring(p_item_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.recurring_items
  set next_due_date = public.next_recurring_date(next_due_date, interval_unit, interval_count, due_day, due_last_day)
  where id = p_item_id and user_id = auth.uid();
$$;
