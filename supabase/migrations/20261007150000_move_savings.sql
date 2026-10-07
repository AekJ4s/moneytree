-- Moves savings between places (p_from null = the main wallet of unassigned savings), atomically:
-- a withdrawal from the source and a deposit into the target on the same day. Cash-neutral, and
-- savings categories keep it out of income/expense totals.
create or replace function public.move_savings(
  p_from uuid,
  p_to uuid,
  p_amount numeric,
  p_date date,
  p_note text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from public.assets;
  v_to public.assets;
  v_note text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  select * into v_to from public.assets where id = p_to and user_id = auth.uid();
  if not found then
    raise exception 'target asset not found';
  end if;
  if p_from is not null then
    select * into v_from from public.assets where id = p_from and user_id = auth.uid();
    if not found then
      raise exception 'source asset not found';
    end if;
    if p_from = p_to then
      raise exception 'source and target are the same';
    end if;
  end if;

  v_note := 'ย้ายจาก ' || coalesce(v_from.name, 'กระเป๋าหลัก') || ' ไป ' || v_to.name
            || coalesce(' · ' || nullif(trim(p_note), ''), '');

  insert into public.transactions (type, amount, txn_date, category, note, source, account, asset_id)
  values ('income', p_amount, p_date,
          case when v_from.kind in ('investment', 'gold') then 'ลงทุน' else 'เก็บออม' end,
          v_note, 'manual', v_from.name, v_from.id);

  insert into public.transactions (type, amount, txn_date, category, note, source, account, asset_id)
  values ('expense', p_amount, p_date,
          case when v_to.kind in ('investment', 'gold') then 'ลงทุน' else 'เก็บออม' end,
          v_note, 'manual', v_to.name, v_to.id);
end;
$$;

revoke execute on function public.move_savings(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.move_savings(uuid, uuid, numeric, date, text) to authenticated;
